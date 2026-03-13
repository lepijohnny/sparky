import { describe, test, expect } from "vitest";
import { ChatDatabase } from "../chat.db";
import { StreamBufferManager } from "../chat.db.buffer";
import { noopLogger } from "../../logger";
import type { Chat } from "../chat.types";

function setup() {
  return new ChatDatabase(":memory:", noopLogger);
}

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: crypto.randomUUID(),
    name: "Test Chat",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("ChatDatabase — chat CRUD", () => {
  test("given a chat, when inserting and reading, then chat is returned", () => {
    const db = setup();
    const chat = makeChat({ name: "Hello" });
    db.createChat(chat);

    const loaded = db.getChat(chat.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Hello");
    expect(loaded!.provider).toBe("anthropic");
  });

  test("given a chat, when updating name, then name is changed", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    const updated = db.updateChat(chat.id, { name: "Renamed" });
    expect(updated!.name).toBe("Renamed");
  });

  test("given a chat, when deleting, then chat is gone", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    const deleted = db.deleteChat(chat.id);
    expect(deleted).toBe(true);
    expect(db.getChat(chat.id)).toBeNull();
  });

  test("given a non-existent id, when deleting, then returns false", () => {
    const db = setup();
    expect(db.deleteChat("nope")).toBe(false);
  });

  test("given chats, when listing, then sorted by updated_at desc", () => {
    const db = setup();
    db.createChat(makeChat({ id: "a", name: "First", updatedAt: "2026-01-01T00:00:00Z" }));
    db.createChat(makeChat({ id: "b", name: "Second", updatedAt: "2026-01-02T00:00:00Z" }));

    const list = db.getChats();
    expect(list[0].name).toBe("Second");
    expect(list[1].name).toBe("First");
  });

  test("given chats, when filtering archived, then only archived returned", () => {
    const db = setup();
    db.createChat(makeChat({ id: "a", archived: false }));
    db.createChat(makeChat({ id: "b", archived: true }));

    expect(db.getChats({ archived: true }).length).toBe(1);
    expect(db.getChats({ archived: false }).length).toBe(1);
  });

  test("given chats, when filtering flagged, then only flagged returned", () => {
    const db = setup();
    db.createChat(makeChat({ id: "a", flagged: false }));
    db.createChat(makeChat({ id: "b", flagged: true }));

    expect(db.getChats({ flagged: true }).length).toBe(1);
  });

  test("given chats with labels, when filtering by labelId, then matching returned", () => {
    const db = setup();
    db.createChat(makeChat({ id: "a", labels: ["bug", "feature"] }));
    db.createChat(makeChat({ id: "b", labels: ["bug"] }));
    db.createChat(makeChat({ id: "c" }));

    expect(db.getChats({ labelId: "bug" }).length).toBe(2);
    expect(db.getChats({ labelId: "feature" }).length).toBe(1);
    expect(db.getChats({ labelId: "none" }).length).toBe(0);
  });

  test("given chat with labels, when label is stripped, then label removed", () => {
    const db = setup();
    db.createChat(makeChat({ id: "a", labels: ["bug", "feature"] }));
    db.createChat(makeChat({ id: "b", labels: ["bug"] }));

    db.removeLabel("bug");

    expect(db.getChat("a")!.labels).toEqual(["feature"]);
    expect(db.getChat("b")!.labels).toBeUndefined();
  });
});

describe("ChatDatabase — counts", () => {
  test("given mixed chats, when counting, then counts are correct", () => {
    const db = setup();
    db.createChat(makeChat({ id: "a" }));
    db.createChat(makeChat({ id: "b", flagged: true }));
    db.createChat(makeChat({ id: "c", archived: true }));
    db.createChat(makeChat({ id: "d", labels: ["bug"] }));

    const c = db.getCounts();
    expect(c.chats).toBe(3);
    expect(c.flagged).toBe(1);
    expect(c.archived).toBe(1);
    expect(c.labeled).toBe(1);
    expect(c.labels).toEqual({ bug: 1 });
  });
});

describe("ChatDatabase — entries", () => {
  test("given entries, when reading latest, then returns in chronological order", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello", timestamp: "2026-01-01T00:00:00Z" });
    db.addEntry(chat.id, { kind: "message", id: "t1", role: "assistant", content: "Hi!", timestamp: "2026-01-01T00:00:01Z" });

    const { entries, hasMore } = db.getEntries(chat.id);
    expect(entries.length).toBe(2);
    expect(entries[0].kind).toBe("message");
    expect((entries[0] as any).role).toBe("user");
    expect(entries[1].kind).toBe("message");
    expect((entries[1] as any).role).toBe("assistant");
    expect(hasMore).toBe(false);
  });

  test("given many entries, when reading with limit, then paginates correctly", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    for (let i = 0; i < 10; i++) {
      db.addEntry(chat.id, { kind: "message", id: `t${i}`, role: "user", content: `msg ${i}`, timestamp: `2026-01-01T00:00:${String(i).padStart(2, "0")}Z` });
    }

    const page1 = db.getEntries(chat.id, 3);
    expect(page1.entries.length).toBe(3);
    expect(page1.hasMore).toBe(true);
    expect((page1.entries[2] as any).content).toBe("msg 9");

    const oldestRowid = page1.entries[0].rowid!;
    const page2 = db.getEntries(chat.id, 3, oldestRowid);
    expect(page2.entries.length).toBe(3);
    expect(page2.hasMore).toBe(true);
    expect((page2.entries[2] as any).content).toBe("msg 6");
  });

  test("given chat with entries, when deleting chat, then entries are cascade deleted", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello", timestamp: "2026-01-01T00:00:00Z" });

    db.deleteChat(chat.id);

    // Re-insert chat to test entries are gone
    db.createChat(chat);
    const { entries } = db.getEntries(chat.id);
    expect(entries.length).toBe(0);
  });

  test("given activity entry, when inserting, then metadata is stored as JSON", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    db.addEntry(chat.id, {
      kind: "activity",
      messageId: "t1",
      source: "agent",
      type: "agent.tool.start",
      timestamp: "2026-01-01T00:00:00Z",
      data: { name: "web_search", input: { query: "test" } },
    });

    const { entries } = db.getEntries(chat.id);
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe("activity");
    const act = entries[0] as any;
    expect(act.type).toBe("agent.tool.start");
    expect(act.data.name).toBe("web_search");
  });
});

function setupWithBuffer() {
  const db = setup();
  const buffer = new StreamBufferManager(db, noopLogger);
  return { db, buffer };
}

describe("ChatDatabase — stream buffer", () => {
  test("given text deltas, when done arrives, then buffer is cleared without flush", () => {
    const { db, buffer } = setupWithBuffer();
    const chat = makeChat();
    db.createChat(chat);

    // Simulate streaming
    buffer.onStreamEvent(chat.id, { kind: "activity", messageId: "t1", source: "agent", type: "agent.text.delta", timestamp: "t", data: { content: "Hello " } });
    buffer.onStreamEvent(chat.id, { kind: "activity", messageId: "t1", source: "agent", type: "agent.text.delta", timestamp: "t", data: { content: "world" } });

    // text.done arrives as message — clears buffer
    buffer.onStreamEvent(chat.id, { kind: "message", id: "t1", role: "assistant", content: "Hello world", timestamp: "t" });

    // done clears cache
    buffer.onStreamEvent(chat.id, { kind: "activity", messageId: "t1", source: "agent", type: "agent.done", timestamp: "t" });

    const { entries } = db.getEntries(chat.id);
    const msgs = entries.filter((e) => e.kind === "message");
    expect(msgs.length).toBe(1);
    expect((msgs[0] as any).content).toBe("Hello world");
  });

  test("given text deltas, when stopped arrives, then partial message is flushed", () => {
    const { db, buffer } = setupWithBuffer();
    const chat = makeChat();
    db.createChat(chat);

    buffer.onStreamEvent(chat.id, { kind: "message", id: "t1", role: "user", content: "Hi", timestamp: "t" });
    buffer.onStreamEvent(chat.id, { kind: "activity", messageId: "t1", source: "agent", type: "agent.text.delta", timestamp: "t", data: { content: "partial " } });
    buffer.onStreamEvent(chat.id, { kind: "activity", messageId: "t1", source: "agent", type: "agent.text.delta", timestamp: "t", data: { content: "response" } });
    buffer.onStreamEvent(chat.id, { kind: "activity", messageId: "t1", source: "agent", type: "agent.stopped", timestamp: "t" });

    const { entries } = db.getEntries(chat.id);
    const msgs = entries.filter((e) => e.kind === "message");
    expect(msgs.length).toBe(2);
    expect((msgs[0] as any).content).toBe("Hi");
    expect((msgs[1] as any).content).toBe("partial response");
  });

  test("given thinking deltas, when stopped, then thinking is not persisted", () => {
    const { db, buffer } = setupWithBuffer();
    const chat = makeChat();
    db.createChat(chat);

    buffer.onStreamEvent(chat.id, { kind: "activity", messageId: "t1", source: "agent", type: "agent.thinking.delta", timestamp: "t", data: { content: "thinking..." } });
    buffer.onStreamEvent(chat.id, { kind: "activity", messageId: "t1", source: "agent", type: "agent.stopped", timestamp: "t" });

    const { entries } = db.getEntries(chat.id);
    expect(entries.filter((e) => e.kind === "activity" && (e as any).type === "thinking.delta").length).toBe(0);
  });

  test("given shouldPersist, then messages always persist and only specific activity types persist", () => {
    expect(StreamBufferManager.shouldPersist({ kind: "message", id: "x", role: "user", content: "hi", timestamp: "t" })).toBe(true);
    expect(StreamBufferManager.shouldPersist({ kind: "activity", messageId: "x", source: "agent", type: "agent.done", timestamp: "t" })).toBe(true);
    expect(StreamBufferManager.shouldPersist({ kind: "activity", messageId: "x", source: "agent", type: "agent.stopped", timestamp: "t" })).toBe(true);
    expect(StreamBufferManager.shouldPersist({ kind: "activity", messageId: "x", source: "agent", type: "agent.error", timestamp: "t" })).toBe(true);
    expect(StreamBufferManager.shouldPersist({ kind: "activity", messageId: "x", source: "agent", type: "agent.thinking.start", timestamp: "t" })).toBe(true);
    expect(StreamBufferManager.shouldPersist({ kind: "activity", messageId: "x", source: "agent", type: "agent.tool.start", timestamp: "t" })).toBe(true);
    expect(StreamBufferManager.shouldPersist({ kind: "activity", messageId: "x", source: "agent", type: "agent.text.delta", timestamp: "t" })).toBe(false);
    expect(StreamBufferManager.shouldPersist({ kind: "activity", messageId: "x", source: "agent", type: "agent.thinking.delta", timestamp: "t" })).toBe(false);
    expect(StreamBufferManager.shouldPersist({ kind: "activity", messageId: "x", source: "agent", type: "agent.tool.result", timestamp: "t" })).toBe(true);
  });
});

describe("ChatDatabase — FTS search", () => {
  test("given messages, when searching, then matching results are returned", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "How do I use TypeScript generics?", timestamp: "t" });
    db.addEntry(chat.id, { kind: "message", id: "t1", role: "assistant", content: "TypeScript generics allow you to write reusable code.", timestamp: "t" });
    db.addEntry(chat.id, { kind: "message", id: "t2", role: "user", content: "What about Python decorators?", timestamp: "t" });

    const results = db.searchEntries("TypeScript");
    expect(results.length).toBe(2);
  });

  test("given messages in different chats, when searching by chatId, then scoped to chat", () => {
    const db = setup();
    const chat1 = makeChat({ id: "c1" });
    const chat2 = makeChat({ id: "c2" });
    db.createChat(chat1);
    db.createChat(chat2);

    db.addEntry("c1", { kind: "message", id: "t1", role: "user", content: "TypeScript tips", timestamp: "t" });
    db.addEntry("c2", { kind: "message", id: "t2", role: "user", content: "TypeScript patterns", timestamp: "t" });

    const results = db.searchEntries("TypeScript", "c1");
    expect(results.length).toBe(1);
  });
});

describe("ChatDatabase — searchChats", () => {
  test("given messages across chats, when searching, then returns chats with match counts", () => {
    const db = setup();
    const chat1 = makeChat({ id: "c1", name: "Chat One" });
    const chat2 = makeChat({ id: "c2", name: "Chat Two" });
    db.createChat(chat1);
    db.createChat(chat2);

    db.addEntry("c1", { kind: "message", id: "t1", role: "user", content: "Serbia is nice", timestamp: "t" });
    db.addEntry("c1", { kind: "message", id: "t1", role: "assistant", content: "Serbia is in Europe", timestamp: "t" });
    db.addEntry("c2", { kind: "message", id: "t2", role: "user", content: "Tell me about Serbia", timestamp: "t" });

    const results = db.searchChats("Serbia");
    expect(results.length).toBe(2);
    expect(results[0].matchCount).toBe(2);
    expect(results[0].chat.id).toBe("c1");
    expect(results[1].matchCount).toBe(1);
    expect(results[1].chat.id).toBe("c2");
  });

  test("given no matching messages, when searching, then returns empty array", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello world", timestamp: "t" });

    const results = db.searchChats("nonexistent");
    expect(results.length).toBe(0);
  });

  test("given flagged and unflagged chats, when searching with flagged filter, then returns only flagged", () => {
    const db = setup();
    const chat1 = makeChat({ id: "c1", flagged: true });
    const chat2 = makeChat({ id: "c2", flagged: false });
    db.createChat(chat1);
    db.createChat(chat2);

    db.addEntry("c1", { kind: "message", id: "t1", role: "user", content: "TypeScript rocks", timestamp: "t" });
    db.addEntry("c2", { kind: "message", id: "t2", role: "user", content: "TypeScript is great", timestamp: "t" });

    const results = db.searchChats("TypeScript", { flagged: true });
    expect(results.length).toBe(1);
    expect(results[0].chat.id).toBe("c1");
  });

  test("given archived chats, when searching with archived filter, then returns only archived", () => {
    const db = setup();
    const chat1 = makeChat({ id: "c1", archived: true });
    const chat2 = makeChat({ id: "c2", archived: false });
    db.createChat(chat1);
    db.createChat(chat2);

    db.addEntry("c1", { kind: "message", id: "t1", role: "user", content: "Python tips", timestamp: "t" });
    db.addEntry("c2", { kind: "message", id: "t2", role: "user", content: "Python patterns", timestamp: "t" });

    const results = db.searchChats("Python", { archived: true });
    expect(results.length).toBe(1);
    expect(results[0].chat.id).toBe("c1");
  });

  test("given chat titles, when searching by title, then returns matching chats", () => {
    const db = setup();
    const chat1 = makeChat({ id: "c1", name: "TypeScript Guide" });
    const chat2 = makeChat({ id: "c2", name: "Python Tutorial" });
    db.createChat(chat1);
    db.createChat(chat2);

    const results = db.searchChats("TypeScript");
    expect(results.length).toBe(1);
    expect(results[0].chat.id).toBe("c1");
    expect(results[0].matchCount).toBe(1);
  });

  test("given chat with matching title and messages, when searching, then counts both", () => {
    const db = setup();
    const chat = makeChat({ id: "c1", name: "Serbia Travel" });
    db.createChat(chat);
    db.addEntry("c1", { kind: "message", id: "t1", role: "user", content: "Tell me about Serbia", timestamp: "t" });

    const results = db.searchChats("Serbia");
    expect(results.length).toBe(1);
    expect(results[0].matchCount).toBe(2);
  });

  test("given renamed chat, when searching new name, then finds it", () => {
    const db = setup();
    const chat = makeChat({ id: "c1", name: "Old Name" });
    db.createChat(chat);
    db.updateChat("c1", { name: "Rust Patterns" });

    const results = db.searchChats("Rust");
    expect(results.length).toBe(1);

    const oldResults = db.searchChats("Old");
    expect(oldResults.length).toBe(0);
  });

  test("given deleted chat, when searching its title, then returns nothing", () => {
    const db = setup();
    const chat = makeChat({ id: "c1", name: "Deleted Topic" });
    db.createChat(chat);
    db.deleteChat("c1");

    const results = db.searchChats("Deleted");
    expect(results.length).toBe(0);
  });

  test("given query with double quotes, when searching, then does not throw", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello world", timestamp: "t" });

    const results = db.searchChats('" OR 1=1 --');
    expect(results.length).toBe(0);
  });

  test("given labeled chats, when searching with labelId filter, then returns only matching label", () => {
    const db = setup();
    const chat1 = makeChat({ id: "c1", labels: ["lbl-1", "lbl-2"] });
    const chat2 = makeChat({ id: "c2", labels: ["lbl-3"] });
    db.createChat(chat1);
    db.createChat(chat2);

    db.addEntry("c1", { kind: "message", id: "t1", role: "user", content: "Rust ownership", timestamp: "t" });
    db.addEntry("c2", { kind: "message", id: "t2", role: "user", content: "Rust lifetimes", timestamp: "t" });

    const results = db.searchChats("Rust", { labelId: "lbl-1" });
    expect(results.length).toBe(1);
    expect(results[0].chat.id).toBe("c1");
  });
});

// ---------------------------------------------------------------------------
// Anchor messages
// ---------------------------------------------------------------------------
describe("ChatDatabase — anchors", () => {
  test("given a message, when toggling anchor on, then getAnchored returns it", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowid = db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello", timestamp: "t" });

    db.toggleAnchor(chat.id, rowid, true);

    const anchored = db.getAnchored(chat.id);
    expect(anchored).toHaveLength(1);
    expect(anchored[0].kind).toBe("message");
    if (anchored[0].kind === "message") {
      expect(anchored[0].content).toBe("Hello");
      expect(anchored[0].anchored).toBe(true);
    }
  });

  test("given an anchored message, when toggling anchor off, then getAnchored returns empty", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowid = db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello", timestamp: "t" });

    db.toggleAnchor(chat.id, rowid, true);
    db.toggleAnchor(chat.id, rowid, false);

    expect(db.getAnchored(chat.id)).toHaveLength(0);
  });

  test("given multiple messages, when anchoring two, then getAnchored returns both in order", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const r1 = db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "First", timestamp: "t1" });
    db.addEntry(chat.id, { kind: "message", id: "t1", role: "assistant", content: "Reply", timestamp: "t2" });
    const r3 = db.addEntry(chat.id, { kind: "message", id: "t2", role: "user", content: "Second", timestamp: "t3" });

    db.toggleAnchor(chat.id, r3, true);
    db.toggleAnchor(chat.id, r1, true);

    const anchored = db.getAnchored(chat.id);
    expect(anchored).toHaveLength(2);
    expect(anchored[0].rowid).toBe(r1);
    expect(anchored[1].rowid).toBe(r3);
  });

  test("given anchored message, when fetching entries, then anchored flag is set", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowid = db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello", timestamp: "t" });

    db.toggleAnchor(chat.id, rowid, true);

    const { entries } = db.getEntries(chat.id);
    const msg = entries.find((e) => e.kind === "message" && e.rowid === rowid);
    expect(msg).toBeDefined();
    if (msg?.kind === "message") {
      expect(msg.anchored).toBe(true);
    }
  });

  test("given no anchored messages, when getAnchored, then returns empty array", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello", timestamp: "t" });

    expect(db.getAnchored(chat.id)).toHaveLength(0);
  });

  test("given anchored message in chat A, when getAnchored for chat B, then returns empty", () => {
    const db = setup();
    const chatA = makeChat({ id: "a" });
    const chatB = makeChat({ id: "b" });
    db.createChat(chatA);
    db.createChat(chatB);
    const rowid = db.addEntry("a", { kind: "message", id: "t1", role: "user", content: "Hello", timestamp: "t" });
    db.toggleAnchor("a", rowid, true);

    expect(db.getAnchored("b")).toHaveLength(0);
  });

  test("given anchored message, when deleting chat, then anchors are cleaned up", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowid = db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Hello", timestamp: "t" });
    db.toggleAnchor(chat.id, rowid, true);
    db.deleteChat(chat.id);

    expect(db.getAnchored(chat.id)).toHaveLength(0);
  });

  test("given assistant message, when anchoring, then getAnchored returns it", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "Question", timestamp: "t1" });
    const r2 = db.addEntry(chat.id, { kind: "message", id: "t1", role: "assistant", content: "Answer", timestamp: "t2" });

    db.toggleAnchor(chat.id, r2, true);

    const anchored = db.getAnchored(chat.id);
    expect(anchored).toHaveLength(1);
    if (anchored[0].kind === "message") {
      expect(anchored[0].role).toBe("assistant");
    }
  });
});

// ---------------------------------------------------------------------------
// Summary storage
// ---------------------------------------------------------------------------
describe("ChatDatabase — summaries", () => {
  test("given no summary, when getSummary, then returns null", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    expect(db.getSummary(chat.id)).toBeNull();
  });

  test("given upserted summary, when getSummary, then returns content and coversUpTo", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    db.upsertSummary(chat.id, "The user discussed REST APIs.", 42);

    const summary = db.getSummary(chat.id);
    expect(summary).not.toBeNull();
    expect(summary!.content).toBe("The user discussed REST APIs.");
    expect(summary!.coversUpTo).toBe(42);
  });

  test("given existing summary, when upserting again, then only one summary exists", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);

    db.upsertSummary(chat.id, "First summary", 10);
    db.upsertSummary(chat.id, "Updated summary", 20);

    const summary = db.getSummary(chat.id);
    expect(summary!.content).toBe("Updated summary");
    expect(summary!.coversUpTo).toBe(20);
  });

  test("given entries range, when getEntriesRange, then returns entries in range", () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const r1 = db.addEntry(chat.id, { kind: "message", id: "t1", role: "user", content: "First", timestamp: "t1" });
    const r2 = db.addEntry(chat.id, { kind: "message", id: "t1", role: "assistant", content: "Reply", timestamp: "t2" });
    const r3 = db.addEntry(chat.id, { kind: "message", id: "t2", role: "user", content: "Second", timestamp: "t3" });

    const range = db.getEntriesRange(chat.id, r1, r2);
    expect(range).toHaveLength(2);
    expect(range[0].kind === "message" && range[0].content).toBe("First");
    expect(range[1].kind === "message" && range[1].content).toBe("Reply");
  });

  test("given summary in chat A, when getSummary for chat B, then returns null", () => {
    const db = setup();
    const chatA = makeChat({ id: "a" });
    const chatB = makeChat({ id: "b" });
    db.createChat(chatA);
    db.createChat(chatB);

    db.upsertSummary("a", "Summary A", 5);

    expect(db.getSummary("b")).toBeNull();
  });
});
