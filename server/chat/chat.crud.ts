import { rmSync } from "node:fs";
import { join } from "node:path";
import type { EventBus } from "../core/bus";
import type { ConfigManager } from "../core/config";
import type { Logger } from "../logger.types";
import type { ChatDatabase } from "./chat.db";
import type { Chat, ChatEntry } from "./chat.types";
import { loadRole } from "../prompts/prompt.role";

/** System labels: auto-assigned, accent-colored, hidden from user label management */
export const SYSTEM_LABELS: Record<string, { id: string; name: string }> = {
  connection: { id: "_connection", name: "Connection" },
  permissions: { id: "_permission", name: "Permission" },
  skills:     { id: "_skill",      name: "Skill" },
  routines:   { id: "_routine",    name: "Routine" },
};

export function isSystemLabel(id: string): boolean {
  return id.startsWith("_");
}

function getAgentRole(kind?: string): { role: string; name: string; systemLabel?: string } {
  const map: Record<string, { role: string; name: string; systemLabel?: string }> = {
    connection:  { role: "connect",  name: "Connection Assistant",  systemLabel: SYSTEM_LABELS.connection.id },
    permissions: { role: "trust",    name: "Permission Assistant",  systemLabel: SYSTEM_LABELS.permissions.id },
    skills:      { role: "skills",   name: "Skills Assistant",      systemLabel: SYSTEM_LABELS.skills.id },
    routines:    { role: "routines", name: "Routine Assistant",     systemLabel: SYSTEM_LABELS.routines.id },
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

  create(data?: { name?: string; unread?: boolean }): { chat: Chat } {
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
      unread: data?.unread !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.db.createChat(chat);

    this.log.info("Created chat", { id: chat.id, name: chat.name });
    this.bus.emit("chat.created", { chat });
    return { chat };
  }

  createSystem(kind?: "general" | "connection" | "permissions" | "skills" | "routines"): Chat {
    const llmDefault = this.config.get("llmDefault");
    const llms = this.config.get("llms") ?? [];
    const defaultConn = llms.find((c) => c.id === llmDefault?.id);
    const { role, name, systemLabel } = getAgentRole(kind);

    const chat: Chat = {
      id: crypto.randomUUID(),
      name,
      model: defaultConn?.model ?? "",
      provider: defaultConn?.provider ?? "",
      connectionId: defaultConn?.id,
      thinking: defaultConn?.thinking ?? null,
      knowledge: loadRole(role).meta.knowledge,
      role,
      labels: systemLabel ? [systemLabel] : undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.db.createChat(chat);
    this.log.info("Created system chat", { id: chat.id });
    this.bus.emit("chat.created", { chat });
    return chat;
  }

  branch(data: { chatId: string; beforeRowid: number }): { chat: Chat } {
    const source = this.db.getChat(data.chatId);
    if (!source) throw new Error(`Chat not found: ${data.chatId}`);

    const chat: Chat = {
      id: crypto.randomUUID(),
      name: `Branch of ${source.name}`,
      model: source.model,
      provider: source.provider,
      connectionId: source.connectionId,
      thinking: source.thinking,
      knowledge: source.knowledge,
      mode: source.mode,
      role: source.role,
      labels: source.labels,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const copied = this.db.branchChat(chat, data.chatId, data.beforeRowid);
    this.log.info("Branched chat", { source: data.chatId, target: chat.id, entries: copied });
    this.bus.emit("chat.created", { chat });
    return { chat };
  }

  deleteTurn(data: { chatId: string; turnId: string }): { deleted: number } {
    const deleted = this.db.deleteTurn(data.chatId, data.turnId);
    if (deleted > 0) this.log.info("Deleted turn", { chatId: data.chatId, turnId: data.turnId, entries: deleted });
    return { deleted };
  }

  editEntry(data: { chatId: string; rowid: number; content: string }): { ok: boolean } {
    const ok = this.db.updateEntryContent(data.chatId, data.rowid, data.content);
    if (ok) this.log.info("Edited entry", { chatId: data.chatId, rowid: data.rowid });
    return { ok };
  }

  delete(data: { id: string }): { deleted: boolean } {
    const deleted = this.db.deleteChat(data.id);
    if (deleted) {
      this.log.info("Deleted chat", { id: data.id });
      this.bus.emit("chat.deleted", { id: data.id });
      if (this.workspacePath) {
        const chatDir = join(this.workspacePath, "chats", data.id);
        try {
          rmSync(chatDir, { recursive: true, force: true });
        } catch (err) {
          this.log.warn("Failed to remove chat directory", { id: data.id, error: String(err) });
        }
      }
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

  unread(data: { id: string; unread: boolean }): { chat: Chat } {
    const chat = this.db.updateChat(data.id, { unread: data.unread });
    if (!chat) throw new Error(`Chat not found: ${data.id}`);

    this.log.info("Unread chat", { id: data.id, unread: data.unread });
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
    const existing = this.db.getChat(data.id);
    if (!existing) throw new Error(`Chat not found: ${data.id}`);
    const systemLabels = (existing.labels ?? []).filter(isSystemLabel);
    const userLabels = data.labels.filter((id) => !isSystemLabel(id));
    const merged = [...systemLabels, ...userLabels];
    const chat = this.db.updateChat(data.id, {
      labels: merged.length > 0 ? merged : undefined,
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

    const { entries: recent, hasMore } = this.db.getEntries(data.id, 10);
    const anchored = this.db.getAnchored(data.id);

    const recentRowids = new Set(recent.map((e) => e.rowid));
    const extra = anchored.filter((e) => !recentRowids.has(e.rowid));
    const entries = extra.length > 0 ? [...extra, ...recent] : recent;

    this.db.enrichWithAttachments(entries, this.workspacePath);

    this.log.debug("Loaded chat", { id: data.id, entries: entries.length, anchored: anchored.length, hasMore });
    return { chat, entries, hasMore };
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
