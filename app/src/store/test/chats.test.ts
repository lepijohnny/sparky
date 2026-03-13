import { describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../index";
import type { Chat } from "../../types/chat";

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: crypto.randomUUID(),
    name: "Test",
    model: "m",
    provider: "p",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("chats slice", () => {
  beforeEach(() => {
    useStore.setState({ chats: [] });
  });

  test("given empty store, when setChats called, then stores sorted by updatedAt", () => {
    const old = makeChat({ updatedAt: "2025-01-01T00:00:00Z", name: "old" });
    const recent = makeChat({ updatedAt: "2025-12-01T00:00:00Z", name: "recent" });
    useStore.getState().setChats([old, recent]);

    const chats = useStore.getState().chats;
    expect(chats[0].name).toBe("recent");
    expect(chats[1].name).toBe("old");
  });

  test("given chats exist, when addChat called with new chat, then prepends it", () => {
    const existing = makeChat({ updatedAt: "2025-01-01T00:00:00Z" });
    useStore.getState().setChats([existing]);
    const newChat = makeChat({ updatedAt: "2025-12-01T00:00:00Z" });
    useStore.getState().addChat(newChat);

    expect(useStore.getState().chats).toHaveLength(2);
    expect(useStore.getState().chats[0].id).toBe(newChat.id);
  });

  test("given chats exist, when addChat called with duplicate id, then ignores it", () => {
    const chat = makeChat();
    useStore.getState().setChats([chat]);
    useStore.getState().addChat(chat);

    expect(useStore.getState().chats).toHaveLength(1);
  });

  test("given chats exist, when patchChat called, then updates matching chat", () => {
    const chat = makeChat({ name: "old name" });
    useStore.getState().setChats([chat]);
    useStore.getState().patchChat({ ...chat, name: "new name" });

    expect(useStore.getState().chats[0].name).toBe("new name");
  });

  test("given chats exist, when patchChat called with unknown id, then adds it", () => {
    const existing = makeChat();
    useStore.getState().setChats([existing]);
    const newChat = makeChat({ name: "new" });
    useStore.getState().patchChat(newChat);

    expect(useStore.getState().chats).toHaveLength(2);
  });

  test("given chats exist, when removeChat called, then removes it", () => {
    const chat1 = makeChat();
    const chat2 = makeChat();
    useStore.getState().setChats([chat1, chat2]);
    useStore.getState().removeChat(chat2.id);

    expect(useStore.getState().chats).toHaveLength(1);
    expect(useStore.getState().chats[0].id).toBe(chat1.id);
  });

  test("given chats exist, when removeChat called for unknown id, then no change", () => {
    const chat = makeChat();
    useStore.getState().setChats([chat]);
    useStore.getState().removeChat("nonexistent");

    expect(useStore.getState().chats).toHaveLength(1);
  });

  test("given chats exist, when getFirstChat called, then returns first non-archived", () => {
    const archived = makeChat({ archived: true, updatedAt: "2025-12-01T00:00:00Z" });
    const active = makeChat({ updatedAt: "2025-01-01T00:00:00Z" });
    useStore.getState().setChats([archived, active]);

    expect(useStore.getState().getFirstChat()?.id).toBe(active.id);
  });

  test("given chats exist, when getChatById called, then returns matching chat", () => {
    const chat = makeChat();
    useStore.getState().setChats([chat]);

    expect(useStore.getState().getChatById(chat.id)?.id).toBe(chat.id);
    expect(useStore.getState().getChatById("nonexistent")).toBeNull();
  });

  test("given mixed chats, when getChatCounts called, then returns correct counts", () => {
    const regular = makeChat();
    const flagged = makeChat({ flagged: true });
    const archived = makeChat({ archived: true });
    const labeled = makeChat({ labels: ["lbl-1", "lbl-2"] });
    const flaggedLabeled = makeChat({ flagged: true, labels: ["lbl-1"] });
    useStore.getState().setChats([regular, flagged, archived, labeled, flaggedLabeled]);

    const counts = useStore.getState().getChatCounts();
    expect(counts.chats).toBe(4);
    expect(counts.flagged).toBe(2);
    expect(counts.archived).toBe(1);
    expect(counts.labeled).toBe(2);
    expect(counts.labels["lbl-1"]).toBe(2);
    expect(counts.labels["lbl-2"]).toBe(1);
  });

  test("given no chats, when getChatCounts called, then returns zeros", () => {
    const counts = useStore.getState().getChatCounts();
    expect(counts.chats).toBe(0);
    expect(counts.flagged).toBe(0);
    expect(counts.archived).toBe(0);
    expect(counts.labeled).toBe(0);
    expect(Object.keys(counts.labels)).toHaveLength(0);
  });
});
