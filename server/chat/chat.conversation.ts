import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { v7 as randomUUIDv7 } from "uuid";
import { RecordingAgent } from "../core/adapters/agent.recording";
import type { Agent, AgentMessage, AgentTools, MessageContent, MessagePart } from "../core/agent.types";
import { createRoleToolSet } from "../tools";
import type { EventBus } from "../core/bus";
import { type ToolApproval, createApprovalContext } from "../core/tool.approval";
import { type PermissionMode, type TrustStore, withModeOverride } from "../core/trust";
import type { Logger } from "../logger.types";
import { type ContextResult, contextBuilder } from "./chat.context";
import { generateSummary, shouldSummarize } from "./agent.summarize";
import { loadRole, buildRolePrompt } from "../prompts/prompt.role";
import { getSkillFrontmatter, getAllSkillFrontmatter } from "../skills/skills";
import { runAgentLoop } from "./chat.conversation.loop";
import type { ChatDatabase } from "./chat.db";
import type { ChatEntry } from "./chat.types";
import { generateTitle } from "./agent.rename";

export type AgentFactory = (chatId: string) => Promise<{ agent: Agent; contextWindow?: number; webSearch?: string } | null> | { agent: Agent; contextWindow?: number; webSearch?: string } | null;

export interface KnowledgeSearch {
  search(query: string): Promise<{ sourceFileName: string; content: string; section?: string; score: number }[]>;
}

export type SystemPromptPreferencesFn = () => string;

const DEFAULT_PREFERENCES = "";

export class ChatConversation {
  private activeChats = new Map<string, AbortController>();
  private recording = false;
  wsDir = "";

  constructor(
    private bus: EventBus,
    private db: ChatDatabase,
    private log: Logger,
    private agentFactory: AgentFactory,
    private defaultAgentFactory: AgentFactory,
    private approval: ToolApproval,
    private trust: TrustStore,
    private knowledge: KnowledgeSearch | null = null,
    private getSystemPromptPreferences: SystemPromptPreferencesFn = () => DEFAULT_PREFERENCES,
    private getEnvVars: () => Record<string, string> = () => ({}),
  ) {}

  switchDb(db: ChatDatabase): void {
    this.db = db;
  }

  isStreaming(chatId: string): boolean {
    return this.activeChats.has(chatId);
  }


  setRecording(enabled: boolean): void {
    this.recording = enabled;
    this.log.info("Agent recording", { enabled });
  }

  isRecording(): boolean {
    return this.recording;
  }

  private async getAgent(chatId: string): Promise<{ agent: Agent; contextWindow?: number; webSearch?: string } | null> {
    return await this.agentFactory(chatId);
  }

  stop(data: { chatId: string }): { ok: boolean } {
    const controller = this.activeChats.get(data.chatId);
    if (!controller) return { ok: false };
    this.approval.denyAll(data.chatId);
    controller.abort();
    this.log.info("Stopped chat", { chatId: data.chatId });
    return { ok: true };
  }

  /**
   * Stores the user message and streams the full agent response.
   * Awaits the entire stream — callers decide whether to await or fire-and-forget.
   */
  async ask(data: { chatId: string; content: string; attachmentIds?: string[]; services?: string[]; skills?: string[]; mode?: PermissionMode }): Promise<{ ok: boolean }> {

    if (this.activeChats.has(data.chatId)) {
      throw new Error("Chat is busy — wait for the current response to finish");
    }

    const chat = this.db.getChat(data.chatId);
    if (!chat) throw new Error(`Chat not found: ${data.chatId}`);

    const controller = new AbortController();
    this.activeChats.set(data.chatId, controller);
    const { signal } = controller;

    let turnId: string | undefined;
    try {
      turnId = randomUUIDv7();

      const userEntry: ChatEntry = {
        kind: "message",
        id: turnId,
        role: "user",
        content: data.content,
        timestamp: new Date().toISOString(),
      };
      const rowid = data.attachmentIds?.length
        ? this.db.addEntryWithAttachments(data.chatId, userEntry, data.attachmentIds)
        : this.db.addEntry(data.chatId, userEntry);
      userEntry.rowid = rowid;

      await this.emit(data.chatId, userEntry);

      const role = loadRole(chat.role ?? "sparky");
      const isSystemRole = role.name === "connect" || role.name === "trust";

      // Bump updated_at as soon as the user message is stored so the
      // chat rises to the top of the list immediately. Skip system role
      // chats — they're utilities, shouldn't compete for position.
      if (!isSystemRole) {
        const updated = this.db.updateChat(data.chatId, { updatedAt: new Date().toISOString() });
        if (updated) {
          this.bus.emit("chat.updated", { chat: updated });
        }
      }

      await this.emitActivity(data.chatId, turnId, "agent.start");

      const resolved = await this.getAgent(data.chatId);
      if (!resolved) {
        this.log.debug("No agent configured, message stored only");
        return { ok: true };
      }

      let { agent } = resolved;
      const { contextWindow } = resolved;
      if (!contextWindow) this.log.error("No contextWindow from model — context budget will be incorrect", { chatId: data.chatId });

      if (this.recording) {
        const provider = chat.provider ?? "unknown";
        const model = (chat.model ?? "unknown").replace(/[/:]/g, ".");
        const ts = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
        const dir = join(this.wsDir, ".recordings");
        agent = new RecordingAgent(agent, join(dir, `${provider}.${model}.${ts}.json`));
      }

      const fetcherFn = (pageSize: number, beforeRowid?: number) => this.db.getEntries(data.chatId, pageSize, beforeRowid);

      const roleName = chat.role ?? "sparky";
      const chatMode = data.mode ?? (chat.mode as PermissionMode | undefined) ?? this.trust.data().mode;
      const chatTrust = withModeOverride(this.trust, chatMode);

      const skills = await this.getSkillsMetadata(data.skills, data.chatId);

      const chatCwd = join(this.wsDir, "chats", data.chatId, "cwd");
      await mkdir(chatCwd, { recursive: true });

      const toolCtx = { 
        bus: this.bus, 
        log: this.log, 
        role: roleName, 
        signal, 
        approvalCtx: createApprovalContext(this.approval, roleName, chat.id, turnId), 
        trust: chatTrust, 
        envVars: this.getEnvVars(),
        cwd: chatCwd,
        skillApproved: skills.summaries.length > 0,
      };
      const tools = createRoleToolSet(role, toolCtx, { webSearch: resolved.webSearch });
      const systemPrompt = buildRolePrompt(role, isSystemRole ? "" : this.getSystemPromptPreferences(), chatMode, data.chatId, chatCwd);

      const shouldSearch = role.meta.knowledge && chat.knowledge !== false;
      const knowledgeResults = shouldSearch
        ? await this.searchKnowledge(data.content, data.chatId, chat.name)
        : [];
      const anchoredEntries = role.meta.anchors ? this.db.getAnchored(data.chatId) : [];
      const existingSummary = role.meta.summary ? this.db.getSummary(data.chatId) : null;
      const servicesList = role.meta.services && data.services?.length
        ? data.services
        : [];

      const chatAttachments = role.meta.knowledge
        ? this.db.getAllChatAttachments(data.chatId).map((a) => ({ ...a, path: join(this.wsDir, "chats", data.chatId, "attachments", a.filename) }))
        : [];

      const ctx: ContextResult = contextBuilder(contextWindow)
        .system(systemPrompt)
        .attachments(chatAttachments)
        .tools(tools.defs)
        .services(servicesList)
        .skills(skills.summaries)
        .anchors(anchoredEntries)
        .summary(existingSummary?.content ?? "")
        .knowledge(knowledgeResults)
        .conversation(fetcherFn)
        .build();

      if (ctx.knowledgeChunks > 0) {
        const seen = new Set<string>();
        const sources: { file: string; section?: string; score: number }[] = [];
        for (const r of knowledgeResults.slice(0, ctx.knowledgeChunks)) {
          const key = r.section ? `${r.sourceFileName}:${r.section}` : r.sourceFileName;
          if (seen.has(key)) continue;
          seen.add(key);
          sources.push({ file: r.sourceFileName, section: r.section, score: Math.round(r.score * 100) / 100 });
        }
        const fileSet = new Set(sources.map((s) => s.file));
        const summary = `${fileSet.size} file${fileSet.size !== 1 ? "s" : ""} · ${sources.length} section${sources.length !== 1 ? "s" : ""}`;
        await this.emitActivity(data.chatId, turnId, "agent.knowledge", { sources, summary });
      }

      this.log.debug("Agent turn", {
        chatId: data.chatId,
        role: role.name,
        context: `${ctx.budget.conversationTokens} conv + ${ctx.budget.knowledgeTokens} knowledge, ${ctx.includedTurns} turns, ${ctx.knowledgeChunks} chunks, ${ctx.budget.remaining} remaining${ctx.hasSkippedEntries ? `, ${ctx.skippedTurns} skipped` : ""}`,
        toolCount: tools?.defs.length ?? 0,
        tools: tools?.defs.map((t) => t.name),
        webSearch: resolved.webSearch ?? "none",
      });

      const currentTurnContent = this.buildCurrentTurnContent(data.content, data.attachmentIds);

      const [answer, _] = await Promise.all([
        this.chatAgentLoop(agent, data.chatId, turnId, ctx, signal, tools, currentTurnContent),
        this.renameAgentLoop(chat, data),
      ]);

      // Release before terminal emit so subscribers see the chat as idle
      this.activeChats.delete(data.chatId);
      await this.emitActivity(data.chatId, turnId, `agent.${answer}`, {
        conversationTokens: ctx.budget.conversationTokens,
        contextWindow: ctx.budget.total,
      });

      if (!isSystemRole && answer === "done") {
        this.maybeSummarize(data.chatId, ctx).catch((err) =>
          this.log.error("Background summarization failed", { chatId: data.chatId, error: String(err) })
        );
      }

      return { ok: true };
    } catch (err) {
      if (turnId) {
        await this.emitActivity(data.chatId, turnId, "agent.error", { message: String(err) });
        await this.emitActivity(data.chatId, turnId, "agent.done");
      }
      throw err;
    } finally {
      this.activeChats.delete(data.chatId);
    }
  }

  private async maybeSummarize(chatId: string, ctx: ContextResult): Promise<void> {
    const existing = this.db.getSummary(chatId);
    if (!shouldSummarize(ctx, existing)) return;

    this.log.info("Summarization triggered", { chatId, lastKnownMemoryId: ctx.lastKnownMemoryId });

    const resolved = await this.defaultAgentFactory(chatId);
    if (!resolved) {
      this.log.warn("Summarization skipped: no default agent", { chatId });
      return;
    }

    await generateSummary(this.db, resolved.agent, chatId, ctx.lastKnownMemoryId!, this.log);
  }

  private async emit(chatId: string, entry: ChatEntry): Promise<void> {
    await this.bus.emit("chat.event", { chatId, ...entry });
  }

  private async emitActivity(chatId: string, turnId: string, type: string, data?: any): Promise<void> {
    await this.emit(chatId, {
      kind: "activity",
      messageId: turnId,
      source: "agent",
      type,
      timestamp: new Date().toISOString(),
      ...(data ? { data } : {}),
    });
  }

  private chatAgentLoop(
    agent: Agent,
    chatId: string,
    turnId: string,
    ctx: ContextResult,
    signal: AbortSignal,
    tools?: AgentTools,
    currentTurnContent?: MessageContent,
  ): Promise<"done" | "stopped" | "error"> {
    const messages = currentTurnContent
      ? injectCurrentTurnContent(ctx.messages, currentTurnContent)
      : ctx.messages;
    return runAgentLoop(agent, chatId, turnId, ctx.system, messages, signal, this.emit.bind(this), this.emitActivity.bind(this), tools);
  }

  private async renameAgentLoop(
    chat: { id: string; name: string; system?: boolean; role?: string },
    data: { content: string },
  ): Promise<boolean> {
    if (chat.role && chat.role !== "sparky") return false;
    if (chat.name !== "New Chat") return false;
    try {
      const resolved = await this.defaultAgentFactory(chat.id);
      if (!resolved) return false;
      const title = await generateTitle(resolved.agent, data.content);
      if (!title) return false;
      const updated = this.db.updateChat(chat.id, { name: title });
      if (updated) this.bus.emit("chat.updated", { chat: updated });
      this.log.debug("Auto-renamed chat", { chatId: chat.id, title });
      return !!updated;
    } catch (err) {
      this.log.warn("Auto-rename failed", { chatId: chat.id, error: String(err) });
      return false;
    }
  }

  private buildCurrentTurnContent(text: string, attachmentIds?: string[]): MessageContent | undefined {
    if (!attachmentIds || attachmentIds.length === 0) return undefined;

    const parts: MessagePart[] = [{ type: "text", text }];

    for (const id of attachmentIds) {
      const att = this.db.getAttachment(id);
      if (!att) {
        this.log.warn("Attachment not found, skipping", { id });
        continue;
      }

      const filePath = join(this.wsDir, "chats", att.chat_id, "attachments", att.filename);
      if (att.mime_type.startsWith("image/") && att.mime_type !== "image/svg+xml") {
        parts.push({ type: "image", filePath, mimeType: att.mime_type });
      } else {
        parts.push({ type: "document", filePath, mimeType: att.mime_type, filename: att.filename });
      }
    }

    if (parts.length === 1) return undefined;

    return parts;
  }

  private async getSkillsMetadata(skillIds: string[] | undefined, chatId: string): Promise<{
    summaries: { id: string; name: string; description: string }[];
  }> {
    const ids = new Set(skillIds ?? []);

    if (ids.size === 0) {
      const allMeta = getAllSkillFrontmatter();
      if (allMeta.length > 0) {
        const messages = this.db.getRecentUserMessages(chatId, 20);
        const text = messages.join(" ").toLowerCase();
        for (const meta of allMeta) {
          if (text.includes(`@${meta.name.toLowerCase()}`) || text.includes(`@${meta.id.toLowerCase()}`)) {
            ids.add(meta.id);
          }
        }
        this.log.debug("Skill scan from messages", { found: [...ids], messageCount: messages.length });
      }
    }

    if (ids.size === 0) return { summaries: [] };

    const summaries: { id: string; name: string; description: string }[] = [];
    for (const id of ids) {
      const meta = getSkillFrontmatter(id);
      if (meta) {
        summaries.push({ id: meta.id, name: meta.name, description: meta.description });
      } else {
        this.log.warn("Skill not found in cache", { id });
      }
    }

    return { summaries };
  }

  private async searchKnowledge(
    query: string,
    chatId: string,
    chatName?: string,
  ): Promise<{ sourceFileName: string; content: string; section?: string; score: number }[]> {
    if (!this.knowledge) return [];
    try {
      const recentUserMessages = this.db.getRecentUserMessages(chatId, 3);

      const parts: string[] = [];
      const isDefaultName = !chatName || chatName === "New Chat";
      if (!isDefaultName) parts.push(`Topic: ${chatName}`);
      if (recentUserMessages.length > 1) {
        const history = recentUserMessages.slice(0, -1);
        parts.push(`Previous: ${history.join(" | ")}`);
      }
      parts.push(`Query: ${query}`);
      const searchQuery = parts.join("\n");
      this.log.debug("Knowledge search query", { searchQuery });

      const results = await this.knowledge.search(searchQuery);
      if (results.length > 0) {
        this.log.debug("Knowledge search results", {
          query: searchQuery,
          hits: results.map((r) => ({
            source: r.sourceFileName,
            section: r.section,
            score: r.score,
            length: r.content.length,
          })),
        });
      }
      return results;
    } catch (err) {
      this.log.warn("Knowledge search failed, proceeding without context", { error: String(err) });
      return [];
    }
  }


}

function injectCurrentTurnContent(messages: AgentMessage[], content: MessageContent): AgentMessage[] {
  const result = [...messages];
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === "user") {
      result[i] = { ...result[i], content } as AgentMessage;
      break;
    }
  }
  return result;
}
