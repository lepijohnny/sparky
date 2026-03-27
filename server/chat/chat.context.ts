/**
 * Fluent context builder for assembling agent prompts within a token budget.
 *
 * Usage:
 *   const ctx = await contextBuilder(contextWindow)
 *     .system("You are a helpful assistant.")
 *     .tools(toolDefs)
 *     .knowledge(searchResults)
 *     .conversation(fetcher)
 *     .build();
 */
import type { AgentMessage, AgentToolDef } from "../core/agent.types";
import { estimateTokens } from "../tokens";
import type { AttachmentMeta, ChatEntry } from "./chat.types";

const MESSAGE_OVERHEAD = 4;
const RESPONSE_RESERVE = 4096;
const DEFAULT_CONTEXT_WINDOW = 8192;
const KNOWLEDGE_SHARE = 0.3;
const PAGE_SIZE = 50;

export interface KnowledgeChunk {
  sourceFileName: string;
  content: string;
  section?: string;
}

export interface ContextResult {
  system: string;
  messages: AgentMessage[];
  budget: {
    total: number;
    reserve: number;
    systemTokens: number;
    toolTokens: number;
    anchorTokens: number;
    summaryTokens: number;
    servicesTokens: number;
    skillsTokens: number;
    knowledgeTokens: number;
    conversationTokens: number;
    remaining: number;
  };
  includedTurns: number;
  skippedTurns: number;
  knowledgeChunks: number;
  hasSkippedEntries: boolean;
  lastKnownMemoryId: number | null;
}

export type EntryFetcher = (pageSize: number, beforeRowid?: number) => { entries: ChatEntry[]; hasMore: boolean };

export function contextBuilder(contextWindow?: number): ContextBuilder {
  return new ContextBuilder(contextWindow);
}

/**
 * Legacy wrapper for tests and callers that don't need the fluent API.
 * Builds context with system + tools + conversation (no knowledge).
 */
export function buildContext(
  fetcher: EntryFetcher,
  contextWindow: number | undefined,
  systemPrompt: string,
  tools: AgentToolDef[] = [],
) {
  const ctx = contextBuilder(contextWindow)
    .system(systemPrompt)
    .tools(tools)
    .conversation(fetcher)
    .build();

  return {
    messages: ctx.messages,
    budget: {
      total: ctx.budget.total,
      system: ctx.budget.systemTokens,
      tools: ctx.budget.toolTokens,
      memory: 0,
      reserve: ctx.budget.reserve,
      available: ctx.budget.total - ctx.budget.reserve - ctx.budget.systemTokens - ctx.budget.toolTokens,
    },
    usedTokens: ctx.budget.conversationTokens,
    includedTurns: ctx.includedTurns,
    hasSkippedEntries: ctx.hasSkippedEntries,
  };
}

export class ContextBuilder {
  private total: number;
  private remaining: number;
  private reserveTokens = RESPONSE_RESERVE;

  private systemPrompt = "";
  private systemTokens = 0;
  private toolDefs: AgentToolDef[] = [];
  private toolTokens = 0;
  private knowledgeBlocks: string[] = [];
  private knowledgeTokens = 0;
  private anchorBlocks: string[] = [];
  private anchorTokens = 0;
  private summaryText = "";
  private summaryTokens = 0;
  private servicesBlock = "";
  private servicesTokens = 0;
  private skillsBlock = "";
  private skillsTokens = 0;
  private entryFetcher: EntryFetcher | null = null;

  constructor(contextWindow?: number) {
    this.total = contextWindow ?? DEFAULT_CONTEXT_WINDOW;
    this.remaining = Math.max(0, this.total - this.reserveTokens);
  }

  system(prompt: string): this {
    this.systemPrompt = prompt;
    this.systemTokens = estimateTokens(prompt) + MESSAGE_OVERHEAD;
    this.remaining = Math.max(0, this.remaining - this.systemTokens);
    return this;
  }

  tools(defs: AgentToolDef[] = []): this {
    this.toolDefs = defs;
    this.toolTokens = defs.length > 0 ? estimateTokens(JSON.stringify(defs)) : 0;
    this.remaining = Math.max(0, this.remaining - this.toolTokens);
    return this;
  }

  knowledge(chunks: KnowledgeChunk[] = []): this {
    if (chunks.length === 0 || this.remaining === 0) return this;

    const budget = Math.floor(this.remaining * KNOWLEDGE_SHARE);
    let used = 0;

    for (const chunk of chunks) {
      const attrs = chunk.section
        ? ` name="${chunk.sourceFileName}" section="${chunk.section}"`
        : ` name="${chunk.sourceFileName}"`;
      const block = `<source${attrs}>\n${chunk.content}\n</source>`;
      const cost = estimateTokens(block);
      if (used + cost > budget && this.knowledgeBlocks.length > 0) break;
      this.knowledgeBlocks.push(block);
      used += cost;
    }

    this.knowledgeTokens = used;
    this.remaining = Math.max(0, this.remaining - used);
    return this;
  }

  anchors(entries: ChatEntry[]): this {
    if (entries.length === 0 || this.remaining === 0) return this;

    for (const entry of entries) {
      if (entry.kind !== "message") continue;
      const block = `<anchor role="${entry.role}">\n${entry.content}\n</anchor>`;
      this.anchorBlocks.push(block);
    }

    if (this.anchorBlocks.length > 0) {
      const full = `<anchored-messages>\n${this.anchorBlocks.join("\n")}\n</anchored-messages>`;
      this.anchorTokens = estimateTokens(full);
      this.remaining = Math.max(0, this.remaining - this.anchorTokens);
    }

    return this;
  }

  attachments(files: { filename: string; mime_type: string; path?: string }[]): this {
    if (files.length === 0) return this;
    const lines = files.map((f) => `- ${f.filename} (${f.mime_type})`).join("\n");
    const block = `\n\n## Attachments\nThe user has attached files to this conversation. Images are provided as visual content in messages. Non-image files are converted to markdown and included inline as text.\n${lines}`;
    this.systemPrompt += block;
    const cost = estimateTokens(block);
    this.systemTokens += cost;
    this.remaining = Math.max(0, this.remaining - cost);
    return this;
  }

  summary(text: string): this {
    if (!text || this.remaining === 0) return this;
    this.summaryText = text;
    this.summaryTokens = estimateTokens(text) + MESSAGE_OVERHEAD;
    this.remaining = Math.max(0, this.remaining - this.summaryTokens);
    return this;
  }

  services(list: string[]): this {
    if (list.length === 0 || this.remaining === 0) return this;
    this.servicesBlock = list.join(", ");
    this.servicesTokens = estimateTokens(this.servicesBlock) + MESSAGE_OVERHEAD;
    this.remaining = Math.max(0, this.remaining - this.servicesTokens);
    return this;
  }

  skills(summaries: { id: string; name: string; description: string }[]): this {
    if (summaries.length === 0 || this.remaining === 0) return this;
    const lines = summaries.map((s) => `- **${s.name}**: ${s.description} — read full instructions with \`app_read("~/.sparky/skills/${s.id}/SKILL.md")\``);
    this.skillsBlock = lines.join("\n");
    this.skillsTokens = estimateTokens(this.skillsBlock) + MESSAGE_OVERHEAD;
    this.remaining = Math.max(0, this.remaining - this.skillsTokens);
    return this;
  }

  conversation(fetcher: EntryFetcher): this {
    this.entryFetcher = fetcher;
    return this;
  }

  build(): ContextResult {
    let fullSystem = this.systemPrompt;
    if (this.servicesBlock) {
      fullSystem += `\n\n<connected-services>\n${this.servicesBlock}\n</connected-services>`;
    }
    if (this.skillsBlock) {
      fullSystem += `\n\n<active-skills>\nThe user tagged these skills. Read the SKILL.md before proceeding.\n${this.skillsBlock}\n</active-skills>`;
    }
    if (this.anchorBlocks.length > 0) {
      fullSystem += `\n\n<anchored-messages>\n${this.anchorBlocks.join("\n")}\n</anchored-messages>`;
    }
    if (this.summaryText) {
      fullSystem += `\n\n<conversation-summary>\n${this.summaryText}\n</conversation-summary>`;
    }
    if (this.knowledgeBlocks.length > 0) {
      fullSystem += `\n\n<context>\n${this.knowledgeBlocks.join("\n")}\n</context>`;
    }

    let conversationTokens = 0;
    let includedTurns = 0;
    let skippedTurns = 0;
    let hasSkippedEntries = false;
    let lastKnownMemoryId: number | null = null;
    let messages: AgentMessage[] = [];

    if (this.entryFetcher && this.remaining > 0) {
      const conv = buildConversation(this.entryFetcher, this.remaining);
      messages = conv.messages;
      conversationTokens = conv.tokensUsed;
      includedTurns = conv.includedTurns;
      skippedTurns = conv.skippedTurns;
      hasSkippedEntries = conv.hasSkippedEntries;
      lastKnownMemoryId = conv.lastKnownMemoryId;
    }

    return {
      system: fullSystem,
      messages,
      budget: {
        total: this.total,
        reserve: this.reserveTokens,
        systemTokens: this.systemTokens,
        toolTokens: this.toolTokens,
        anchorTokens: this.anchorTokens,
        summaryTokens: this.summaryTokens,
        servicesTokens: this.servicesTokens,
        skillsTokens: this.skillsTokens,
        knowledgeTokens: this.knowledgeTokens,
        conversationTokens,
        remaining: Math.max(0, this.remaining - conversationTokens),
      },
      includedTurns,
      skippedTurns,
      knowledgeChunks: this.knowledgeBlocks.length,
      hasSkippedEntries,
      lastKnownMemoryId,
    };
  }
}

function buildConversation(
  fetcher: EntryFetcher,
  available: number,
): { messages: AgentMessage[]; tokensUsed: number; includedTurns: number; skippedTurns: number; hasSkippedEntries: boolean; lastKnownMemoryId: number | null } {
  let allEntries: ChatEntry[] = [];
  let cursor: number | undefined;
  let moreInDb = true;

  while (moreInDb) {
    const page = fetcher(PAGE_SIZE, cursor);
    if (page.entries.length === 0) { moreInDb = false; break; }

    allEntries = [...page.entries, ...allEntries];
    moreInDb = page.hasMore;

    if (estimateAllEntries(allEntries) >= available) break;
    cursor = minRowid(page.entries);
  }

  const turns = groupByTurn(allEntries);
  let tokensUsed = 0;
  const included: Turn[] = [];

  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    const turnTokens = estimateTurnTokens(turn);
    if (tokensUsed + turnTokens > available && included.length > 0) break;
    included.unshift(turn);
    tokensUsed += turnTokens;
  }

  const skippedTurns = turns.length - included.length;
  const oldestIncluded = included[0];
  const oldestRowid = oldestIncluded?.userMessage?.rowid ?? oldestIncluded?.assistantMessage?.rowid ?? null;

  return {
    messages: flattenTurns(included),
    tokensUsed,
    includedTurns: included.length,
    skippedTurns,
    hasSkippedEntries: skippedTurns > 0 || moreInDb,
    lastKnownMemoryId: oldestRowid,
  };
}

function minRowid(entries: ChatEntry[]): number | undefined {
  let min: number | undefined;
  for (const e of entries) {
    const r = (e as any).rowid as number | undefined;
    if (r !== undefined && (min === undefined || r < min)) min = r;
  }
  return min;
}

function estimateAllEntries(entries: ChatEntry[]): number {
  let tokens = 0;
  for (const e of entries) {
    if (e.kind === "message") {
      tokens += estimateTokens(e.content) + MESSAGE_OVERHEAD;
    } else if (e.kind === "activity" && e.data) {
      tokens += estimateTokens(JSON.stringify(e.data)) + MESSAGE_OVERHEAD;
    }
  }
  return tokens;
}

interface Turn {
  userMessage?: ChatEntry;
  assistantMessage?: ChatEntry;
  toolCalls: { start: ChatEntry; result?: ChatEntry }[];
}

function groupByTurn(entries: ChatEntry[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;

  for (const entry of entries) {
    if (entry.kind === "message" && entry.role === "user") {
      if (current) turns.push(current);
      current = { userMessage: entry, toolCalls: [] };
    } else if (entry.kind === "message" && entry.role === "assistant") {
      if (!current) current = { toolCalls: [] };
      current.assistantMessage = entry;
    } else if (entry.kind === "activity" && entry.type === "agent.tool.start") {
      if (!current) current = { toolCalls: [] };
      current.toolCalls.push({ start: entry });
    } else if (entry.kind === "activity" && entry.type === "agent.tool.result") {
      if (current && current.toolCalls.length > 0) {
        const last = current.toolCalls[current.toolCalls.length - 1];
        if (!last.result) last.result = entry;
      }
    }
  }

  if (current) turns.push(current);
  return turns;
}

function estimateTurnTokens(turn: Turn): number {
  let tokens = 0;
  if (turn.userMessage?.kind === "message") {
    tokens += estimateTokens(turn.userMessage.content) + MESSAGE_OVERHEAD;
  }
  if (turn.assistantMessage?.kind === "message") {
    tokens += estimateTokens(turn.assistantMessage.content) + MESSAGE_OVERHEAD;
  }
  for (const tc of turn.toolCalls) {
    if (tc.start.kind === "activity") {
      tokens += estimateTokens(JSON.stringify(tc.start.data ?? {})) + MESSAGE_OVERHEAD;
    }
    if (tc.result?.kind === "activity") {
      tokens += estimateTokens(JSON.stringify(tc.result.data ?? {})) + MESSAGE_OVERHEAD;
    }
  }
  return tokens;
}

function flattenTurns(turns: Turn[]): AgentMessage[] {
  const messages: AgentMessage[] = [];

  for (const turn of turns) {
    if (turn.userMessage?.kind === "message") {
      const text = attachmentAnnotation(turn.userMessage.content, turn.userMessage.attachments);
      messages.push({ role: "user", content: text });
    }

    if (turn.toolCalls.length > 0 && turn.assistantMessage?.kind === "message") {
      messages.push({
        role: "assistant",
        content: turn.assistantMessage.content,
        toolCalls: turn.toolCalls.map((tc) => ({
          id: (tc.start as any).data?.id ?? "",
          name: (tc.start as any).data?.name ?? "",
          input: (tc.start as any).data?.input,
        })),
      });

      for (const tc of turn.toolCalls) {
        if (tc.result?.kind === "activity") {
          messages.push({
            role: "tool",
            toolCallId: (tc.start as any).data?.id ?? "",
            content: JSON.stringify((tc.result as any).data?.output ?? ""),
          });
        }
      }
    } else if (turn.assistantMessage?.kind === "message") {
      messages.push({
        role: "assistant",
        content: turn.assistantMessage.content,
      });
    }
  }

  return messages;
}

function attachmentAnnotation(content: string, attachments?: AttachmentMeta[]): string {
  if (!attachments || attachments.length === 0) return content;
  const tags = attachments.map((a) => `[attached: ${a.filename} (${a.mimeType})]`).join("\n");
  return `${content}\n${tags}`;
}
