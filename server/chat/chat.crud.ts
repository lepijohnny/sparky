import type { EventBus } from "../core/bus";
import type { ConfigManager } from "../core/config";
import type { Logger } from "../logger.types";
import type { ChatDatabase } from "./chat.db";
import type { Chat, ChatEntry } from "./chat.types";
import { loadRole } from "../prompts/prompt.role";

function getAgentRole(kind?: string): { role: string; name: string } {
  const map: Record<string, { role: string; name: string }> = {
    connection: { role: "connect", name: "Connection Setup" },
    permissions: { role: "trust", name: "Permission Setup" },
  };
  return map[kind ?? ""] ?? { role: "sparky", name: "System Chat" };
}

export class ChatCrud {
  workspacePath = "";

  constructor(
    private bus: EventBus,
    private config: ConfigManager,
    private db: ChatDatabase,
    private log: Logger,
  ) {}

  switchDb(db: ChatDatabase): void {
    this.db = db;
  }

  getCounts(): { chats: number; flagged: number; archived: number; labeled: number; labels: Record<string, number> } {
    return this.db.getCounts();
  }

  list(): { chats: Chat[] } {
    const chats = this.db.getChats({ archived: false });
    this.log.debug("Listed chats", { count: chats.length });
    return { chats };
  }

  listAll(): { chats: Chat[] } {
    const chats = this.db.getChats();
    this.log.debug("Listed all chats", { count: chats.length });
    return { chats };
  }

  listFlagged(): { chats: Chat[] } {
    const chats = this.db.getChats({ archived: false, flagged: true });
    this.log.debug("Listed flagged chats", { count: chats.length });
    return { chats };
  }

  listArchived(): { chats: Chat[] } {
    const chats = this.db.getChats({ archived: true });
    this.log.debug("Listed archived chats", { count: chats.length });
    return { chats };
  }

  listLabeled(data: { labelId?: string }): { chats: Chat[] } {
    let chats: Chat[];
    if (data.labelId) {
      chats = this.db.getChats({ archived: false, labelId: data.labelId });
    } else {
      chats = this.db.getChats({ archived: false }).filter((c) => c.labels?.length);
    }
    this.log.debug("Listed labeled chats", { labelId: data.labelId ?? "all", count: chats.length });
    return { chats };
  }

  create(data?: { name?: string }): { chat: Chat } {
    const llmDefault = this.config.get("llmDefault");
    const llms = this.config.get("llms") ?? [];
    const defaultConn = llms.find((c) => c.id === llmDefault?.id);

    const chat: Chat = {
      id: crypto.randomUUID(),
      name: data?.name ?? "New Chat",
      model: defaultConn?.model ?? "",
      provider: defaultConn?.provider ?? "",
      connectionId: defaultConn?.id,
      thinking: defaultConn?.thinking ?? null,
      knowledge: defaultConn?.knowledge !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.db.createChat(chat);

    this.log.info("Created chat", { id: chat.id, name: chat.name });
    this.bus.emit("chat.created", { chat });
    return { chat };
  }

  createSystem(kind?: "general" | "connection" | "permissions"): Chat {
    const llmDefault = this.config.get("llmDefault");
    const llms = this.config.get("llms") ?? [];
    const defaultConn = llms.find((c) => c.id === llmDefault?.id);
    const { role, name } = getAgentRole(kind);

    const chat: Chat = {
      id: crypto.randomUUID(),
      name,
      model: defaultConn?.model ?? "",
      provider: defaultConn?.provider ?? "",
      connectionId: defaultConn?.id,
      thinking: defaultConn?.thinking ?? null,
      knowledge: loadRole(role).meta.knowledge,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.db.createChat(chat);
    this.log.info("Created system chat", { id: chat.id });
    this.bus.emit("chat.created", { chat });
    return chat;
  }

  delete(data: { id: string }): { deleted: boolean } {
    const deleted = this.db.deleteChat(data.id);
    if (deleted) {
      this.log.info("Deleted chat", { id: data.id });
      this.bus.emit("chat.deleted", { id: data.id });
    }
    return { deleted };
  }

  rename(data: { id: string; name: string }): { chat: Chat } {
    const chat = this.db.updateChat(data.id, { name: data.name.trim() });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Renamed chat", { id: data.id, name: chat.name });
    this.bus.emit("chat.updated", { chat });
    return { chat };
  }

  flag(data: { id: string; flagged: boolean }): { chat: Chat } {
    const chat = this.db.updateChat(data.id, { flagged: data.flagged });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Flagged chat", { id: data.id, flagged: data.flagged });
    this.bus.emit("chat.updated", { chat });
    return { chat };
  }

  archive(data: { id: string; archived: boolean }): { chat: Chat } {
    const chat = this.db.updateChat(data.id, { archived: data.archived });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Archived chat", { id: data.id, archived: data.archived });
    this.bus.emit("chat.updated", { chat });
    return { chat };
  }

  label(data: { id: string; labels: string[] }): { chat: Chat } {
    const chat = this.db.updateChat(data.id, {
      labels: data.labels.length > 0 ? data.labels : undefined,
    });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Labeled chat", { id: data.id, labels: data.labels });
    this.bus.emit("chat.updated", { chat });
    return { chat };
  }

  model(data: { id: string; provider: string; model: string; connectionId?: string }): { chat: Chat } {
    // Resolve connectionId: use provided, or find the default/first matching connection
    let connId = data.connectionId;
    if (!connId) {
      const llms = this.config.get("llms") ?? [];
      const defaultId = this.config.get("llmDefault")?.id;
      const defaultConn = llms.find((c) => c.id === defaultId);
      const conn = (defaultConn?.provider === data.provider ? defaultConn : undefined)
        ?? llms.find((c) => c.provider === data.provider);
      connId = conn?.id;
    }

    const chat = this.db.updateChat(data.id, {
      provider: data.provider,
      model: data.model,
      connectionId: connId,
    });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Set chat model", { id: data.id, provider: data.provider, model: data.model, connectionId: connId });
    this.bus.emit("chat.updated", { chat });
    return { chat };
  }

  thinking(data: { id: string; thinking: number | null }): { chat: Chat } {
    const chat = this.db.updateChat(data.id, { thinking: data.thinking });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Set chat thinking", { id: data.id, thinking: data.thinking });
    this.bus.emit("chat.updated", { chat });
    return { chat };
  }

  knowledge(data: { id: string; knowledge: boolean }): { chat: Chat } {
    const chat = this.db.updateChat(data.id, { knowledge: data.knowledge });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Set chat knowledge", { id: data.id, knowledge: data.knowledge });
    this.bus.emit("chat.updated", { chat });
    return { chat };
  }

  mode(data: { id: string; mode: string | null }): { chat: Chat } {
    if (data.mode && !["read", "write", "execute"].includes(data.mode)) {
      throw new Error(`Invalid mode: ${data.mode}`);
    }
    const chat = this.db.updateChat(data.id, { mode: data.mode });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Set chat mode", { id: data.id, mode: data.mode });
    this.bus.emit("chat.updated", { chat });
    return { chat };
  }

  removeLabel(labelId: string): void {
    const updated = this.db.removeLabel(labelId);
    for (const chat of updated) {
      this.bus.emit("chat.updated", { chat });
    }
  }

  get(data: { id: string }): { chat: Chat; entries: ChatEntry[]; hasMore: boolean } | null {
    const chat = this.db.getChat(data.id);
    if (!chat) return null;

    const entries = this.db.getAllEntries(data.id);
    this.db.enrichWithAttachments(entries, this.workspacePath);

    this.log.debug("Loaded chat", { id: data.id, entries: entries.length });
    return { chat, entries, hasMore: false };
  }

  entries(data: { chatId: string; before?: number }): { entries: ChatEntry[]; hasMore: boolean } {
    const entries = this.db.getAllEntries(data.chatId);
    this.db.enrichWithAttachments(entries, this.workspacePath);
    return { entries, hasMore: false };
  }

  anchorAdd(data: { chatId: string; rowid: number }): void {
    this.db.toggleAnchor(data.chatId, data.rowid, true);
    this.bus.emit("chat.anchored", { chatId: data.chatId });
  }

  anchorRemove(data: { chatId: string; rowid: number }): void {
    this.db.toggleAnchor(data.chatId, data.rowid, false);
    this.bus.emit("chat.anchored", { chatId: data.chatId });
  }

  anchorRename(data: { chatId: string; rowid: number; name: string }): void {
    this.db.renameAnchor(data.chatId, data.rowid, data.name);
  }

  anchored(data: { chatId: string }): { entries: ChatEntry[] } {
    return { entries: this.db.getAnchored(data.chatId) };
  }
}
