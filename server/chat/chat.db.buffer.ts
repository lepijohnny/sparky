import type { Logger } from "../logger.types";
import type { ChatEntry } from "./chat.types";
import type { ChatDatabase } from "./chat.db";

interface StreamBuffer {
  turnId: string;
  textContent: string;
}

/**
 * Ring buffer LRU cache — fixed capacity, oldest evicted silently.
 */
class BufferCache {
  private map = new Map<string, StreamBuffer>();

  constructor(private capacity: number) {}

  get(chatId: string): StreamBuffer | undefined {
    const buf = this.map.get(chatId);
    if (buf) {
      this.map.delete(chatId);
      this.map.set(chatId, buf);
    }
    return buf;
  }

  set(chatId: string, buf: StreamBuffer): void {
    if (this.map.has(chatId)) this.map.delete(chatId);
    if (this.map.size >= this.capacity) {
      const oldest = this.map.keys().next().value!;
      this.map.delete(oldest);
    }
    this.map.set(chatId, buf);
  }

  delete(chatId: string): void {
    this.map.delete(chatId);
  }

  get size(): number {
    return this.map.size;
  }

  get isFull(): boolean {
    return this.map.size >= this.capacity;
  }

  entries(): [string, StreamBuffer][] {
    return [...this.map.entries()];
  }
}

/** Activity types that are persisted to the database */
const PERSISTED_ACTIVITY_TYPES = new Set([
  "agent.start",
  "agent.knowledge",
  "agent.thinking.start",
  "agent.tool.start",
  "agent.tool.result",
  "agent.approval.requested",
  "agent.approval.approved",
  "agent.approval.denied",
  "agent.followup.nudge",
  "agent.done",
  "agent.stopped",
  "agent.error",
]);

/**
 * Buffers streaming text deltas and flushes partial messages on stop/error.
 * Delegates actual persistence to ChatDatabase.
 */
export class StreamBufferManager {
  private cache: BufferCache;

  constructor(
    private db: ChatDatabase,
    private log: Logger,
    maxBuffers = 10,
  ) {
    this.cache = new BufferCache(maxBuffers);
  }

  static shouldPersist(entry: ChatEntry): boolean {
    if (entry.kind === "message") return true;
    if (entry.kind === "activity") return PERSISTED_ACTIVITY_TYPES.has(entry.type);
    return false;
  }

  onStreamEvent(chatId: string, entry: ChatEntry): void {
    if (entry.kind === "activity") {
      const type = entry.type;

      if (type === "agent.text.delta") {
        this.getOrCreateBuffer(chatId, entry.messageId).textContent += (entry.data?.content as string) ?? "";
        return;
      }

      if (type === "agent.thinking.delta") return;

      if (type === "agent.stopped" || type === "agent.error") {
        this.log.debug("Flushing buffer on terminal event", { chatId, type });
        this.flushBuffer(chatId);
        this.db.addEntry(chatId, entry);
        return;
      }

      if (type === "agent.done") {
        this.cache.delete(chatId);
        this.db.addEntry(chatId, entry);
        return;
      }
    }

    // text.done arrives as a message — clear the text buffer
    if (entry.kind === "message" && entry.role === "assistant") {
      const buf = this.cache.get(chatId);
      if (buf) buf.textContent = "";
    }

    if (StreamBufferManager.shouldPersist(entry) && !entry.rowid) {
      this.db.addEntry(chatId, entry);
    }
  }

  flushAll(): void {
    if (this.cache.size > 0) {
      this.log.info("Shutdown: flushing all buffers", { count: this.cache.size });
    }
    for (const [chatId] of this.cache.entries()) {
      this.flushBuffer(chatId);
    }
  }

  getPartialContent(chatId: string): string | null {
    const buf = this.cache.get(chatId);
    return buf && buf.textContent.length > 0 ? buf.textContent : null;
  }

  deleteChat(chatId: string): void {
    this.cache.delete(chatId);
  }

  private getOrCreateBuffer(chatId: string, turnId: string): StreamBuffer {
    let buf = this.cache.get(chatId);
    if (!buf) {
      const wasFull = this.cache.isFull;
      buf = { turnId, textContent: "" };
      this.cache.set(chatId, buf);
      if (wasFull) this.log.debug("Buffer cache full, evicted oldest", { chatId });
    }
    return buf;
  }

  private flushBuffer(chatId: string): void {
    const buf = this.cache.get(chatId);
    if (!buf) return;

    if (buf.textContent.length > 0) {
      this.log.info("Flushing partial message", { chatId, length: buf.textContent.length });
      this.db.addEntry(chatId, {
        kind: "message",
        id: buf.turnId,
        role: "assistant",
        content: buf.textContent,
        timestamp: new Date().toISOString(),
      });
    }

    this.cache.delete(chatId);
  }
}
