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

describe("selection slice", () => {
  beforeEach(() => {
    useStore.setState({
      anchorChat: null,
      selectedChats: new Map(),
      isMulti: false,
      selectedIds: undefined,
      renameChat: null,
    });
  });

  test("given no selection, when selectChat called, then sets anchor", () => {
    const chat = makeChat();
    useStore.getState().selectChat(chat);

    expect(useStore.getState().anchorChat?.id).toBe(chat.id);
    expect(useStore.getState().isMulti).toBe(false);
  });

  test("given anchor set, when selectChat(null) called, then clears anchor", () => {
    const chat = makeChat();
    useStore.getState().selectChat(chat);
    useStore.getState().selectChat(null);

    expect(useStore.getState().anchorChat).toBeNull();
  });

  test("given anchor set, when toggleChat called, then starts multi-select", () => {
    const chat1 = makeChat();
    const chat2 = makeChat();
    useStore.getState().selectChat(chat1);
    useStore.getState().toggleChat(chat2);

    expect(useStore.getState().isMulti).toBe(true);
    expect(useStore.getState().selectedChats.size).toBe(2);
    expect(useStore.getState().selectedIds?.has(chat1.id)).toBe(true);
    expect(useStore.getState().selectedIds?.has(chat2.id)).toBe(true);
  });

  test("given multi-select, when toggle removes to one, then collapses to single", () => {
    const chat1 = makeChat();
    const chat2 = makeChat();
    useStore.getState().selectChat(chat1);
    useStore.getState().toggleChat(chat2);
    useStore.getState().toggleChat(chat1);

    expect(useStore.getState().isMulti).toBe(false);
    expect(useStore.getState().anchorChat?.id).toBe(chat2.id);
    expect(useStore.getState().selectedChats.size).toBe(0);
  });

  test("given anchor set, when rangeSelectChat called, then selects range", () => {
    const chats = [makeChat(), makeChat(), makeChat(), makeChat()];
    useStore.getState().selectChat(chats[0]);
    useStore.getState().rangeSelectChat(chats[2], chats);

    expect(useStore.getState().isMulti).toBe(true);
    expect(useStore.getState().selectedChats.size).toBe(3);
    expect(useStore.getState().selectedIds?.has(chats[0].id)).toBe(true);
    expect(useStore.getState().selectedIds?.has(chats[1].id)).toBe(true);
    expect(useStore.getState().selectedIds?.has(chats[2].id)).toBe(true);
    expect(useStore.getState().selectedIds?.has(chats[3].id)).toBe(false);
  });

  test("given multi-select, when selectAllChats called, then selects all", () => {
    const chats = [makeChat(), makeChat(), makeChat()];
    useStore.getState().selectAllChats(chats);

    expect(useStore.getState().selectedChats.size).toBe(3);
    expect(useStore.getState().isMulti).toBe(true);
  });

  test("given multi-select, when clearSelection called, then clears multi but keeps anchor", () => {
    const chat1 = makeChat();
    const chat2 = makeChat();
    useStore.getState().selectChat(chat1);
    useStore.getState().toggleChat(chat2);
    useStore.getState().clearSelection();

    expect(useStore.getState().isMulti).toBe(false);
    expect(useStore.getState().selectedChats.size).toBe(0);
    expect(useStore.getState().anchorChat?.id).toBe(chat1.id);
  });

  test("given anchor set, when patchSelection called, then updates anchor", () => {
    const chat = makeChat({ name: "old" });
    useStore.getState().selectChat(chat);
    useStore.getState().patchSelection({ ...chat, name: "new" });

    expect(useStore.getState().anchorChat?.name).toBe("new");
  });

  test("given anchor set, when removeSelection called for anchor, then clears it", () => {
    const chat = makeChat();
    useStore.getState().selectChat(chat);
    useStore.getState().removeSelection(chat.id);

    expect(useStore.getState().anchorChat).toBeNull();
  });

  test("given any state, when setRenameChat called, then stores chat", () => {
    const chat = makeChat();
    useStore.getState().setRenameChat(chat);

    expect(useStore.getState().renameChat?.id).toBe(chat.id);
  });
});
