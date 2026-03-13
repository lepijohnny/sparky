import type { EventBus } from "../core/bus";
import type { Configuration } from "../core/config";
import { ToolApproval } from "../core/tool.approval";
import type { Logger } from "../logger.types";
import { type AgentFactory, type KnowledgeSearch, ChatConversation } from "./chat.conversation";

import type { Profile } from "../settings/profile.types";

import { registerAttachmentHandlers, cleanupChatAttachments } from "./chat.attachment";
import { ChatCrud } from "./chat.crud";
import { ChatDatabase } from "./chat.db";
import { StreamBufferManager } from "./chat.db.buffer";
import type { Chat, ChatEvent } from "./chat.types";

export interface ChatWorkspace {
  getChat(id: string): Chat | null;
  removeLabel(labelId: string): void;
  setWorkspacePath(path: string): void;
  switchDb(dbPath: string, log: Logger): void;
  dispose(): void;
}

/** @deprecated Use ChatWorkspace instead */
export type ChatManager = ChatWorkspace;

export function createChatWorkspace(
  bus: EventBus,
  config: Configuration,
  log: Logger,
  dbPath: string,
  workspacePath: string,
  agentFactory: AgentFactory = () => Promise.resolve(null),
  defaultAgentFactory: AgentFactory = () => Promise.resolve(null),
  knowledge: KnowledgeSearch | null = null,
): ChatWorkspace {
  let db = new ChatDatabase(dbPath, log);
  let buffer = new StreamBufferManager(db, log);
  const crud = new ChatCrud(bus, config, db, log);
  crud.workspacePath = workspacePath;
  const approval = new ToolApproval(bus, log);
  approval.registerDefaultRules();

  const getSystemPromptPreferences = () => {
    const profile = (config.get("profile") as Profile | undefined) ?? {};
    const parts: string[] = [];
    if (profile.nickname) parts.push(`The user's name is ${profile.nickname}.`);
    if (profile.language) parts.push(`Respond in ${profile.language}.`);
    if (profile.timezone) parts.push(`The user's timezone is ${profile.timezone}.`);
    if (profile.contextPrompt) parts.push(profile.contextPrompt);
    return parts.join(" ");
  };

  const conversation = new ChatConversation(bus, db, log, agentFactory, defaultAgentFactory, approval, knowledge, getSystemPromptPreferences);
  conversation.wsDir = workspacePath;

  bus.on("tool.approval.pending", (data) => approval.getPending(data.chatId));

  bus.subscribe("chat.event", (event: ChatEvent) => {
    const { chatId, ...entry } = event;
    buffer.onStreamEvent(chatId, entry);
  });

  const shutdown = () => {
    buffer.flushAll();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  bus.on("chat.counts", () => crud.getCounts());
  bus.on("chat.list", () => crud.list());
  bus.on("chat.list.all", () => crud.listAll());
  bus.on("chat.list.flagged", () => crud.listFlagged());
  bus.on("chat.list.archived", () => crud.listArchived());
  bus.on("chat.list.labeled", (data) => crud.listLabeled(data));
  bus.on("chat.create", (data) => crud.create(data));
  bus.on("chat.delete", (data) => {
    const result = crud.delete(data);
    if (result.deleted) cleanupChatAttachments(workspacePath, data.id);
    return result;
  });
  bus.on("chat.rename", (data) => crud.rename(data));
  bus.on("chat.flag", (data) => crud.flag(data));
  bus.on("chat.archive", (data) => crud.archive(data));
  bus.on("chat.label", (data) => crud.label(data));
  bus.on("chat.model", (data) => crud.model(data));
  bus.on("chat.thinking", (data) => crud.thinking(data));
  bus.on("chat.knowledge", (data) => crud.knowledge(data));
  bus.on("chat.get.id", (data) => {
    const result = crud.get(data);
    if (!result) return null;
    const streaming = conversation.isStreaming(data.id);
    const partialContent = streaming ? buffer.getPartialContent(data.id) : null;
    return { ...result, streaming, partialContent };
  });
  bus.on("chat.entries", (data) => crud.entries(data));
  bus.on("chat.anchor.add", (data) => crud.anchorAdd(data));
  bus.on("chat.anchor.remove", (data) => crud.anchorRemove(data));
  bus.on("chat.anchor.rename", (data) => crud.anchorRename(data));
  bus.on("chat.anchored", (data) => crud.anchored(data));

  const attachments = registerAttachmentHandlers(bus, db, log, () => workspacePath);

  bus.on("chat.ask", (data) => {
    conversation.ask(data).catch((err) => {
      log.error("chat.ask error", { chatId: data.chatId, error: String(err) });
    });
    return { ok: true };
  });
  bus.on("chat.stop", (data) => conversation.stop(data));
  bus.on("chat.search", (data) => ({ results: db.searchChats(data.query, data) }));
  bus.on("debug.recording.set", (data) => {
    conversation.setRecording(data.enabled);
    return { ok: true };
  });
  bus.on("debug.recording.get", () => ({
    enabled: conversation.isRecording(),
  }));

  bus.on("chat.system.ask", (data) => {
    const chat = crud.createSystem(data.kind);
    conversation.ask({ chatId: chat.id, content: data.content }).catch((err) => {
      log.error("chat.system.ask error", { chatId: chat.id, error: String(err) });
    });
    return { chatId: chat.id };
  });

  return {
    getChat(id) {
      return db.getChat(id);
    },

    removeLabel(labelId) {
      crud.removeLabel(labelId);
    },

    setWorkspacePath(path) {
      conversation.wsDir = path;
      crud.workspacePath = path;
    },

    switchDb(newDbPath, newLog) {
      buffer.flushAll();
      db.close();
      db = new ChatDatabase(newDbPath, newLog);
      buffer = new StreamBufferManager(db, newLog);
      crud.switchDb(db);
      conversation.switchDb(db);
      attachments.switchDb(db);
    },

    dispose() {
      buffer.flushAll();
      db.close();
    },
  };
}
