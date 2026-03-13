import type { StateCreator } from "zustand";
import type { Chat } from "../types/chat";

export interface SelectionSlice {
  anchorChat: Chat | null;
  selectedChats: Map<string, Chat>;
  isMulti: boolean;
  selectedIds: Set<string> | undefined;
  renameChat: Chat | null;

  selectChat: (chat: Chat | null) => void;
  toggleChat: (chat: Chat) => void;
  rangeSelectChat: (chat: Chat, allChats: Chat[]) => void;
  selectAllChats: (chats: Chat[]) => void;
  clearSelection: () => void;
  patchSelection: (chat: Chat) => void;
  removeSelection: (id: string) => void;
  setRenameChat: (chat: Chat | null) => void;
}

export const createSelectionSlice: StateCreator<SelectionSlice, [], [], SelectionSlice> = (set, get) => ({
  anchorChat: null,
  selectedChats: new Map(),
  isMulti: false,
  selectedIds: undefined,
  renameChat: null,

  selectChat: (chat) => set({
    anchorChat: chat,
    selectedChats: new Map(),
    isMulti: false,
    selectedIds: undefined,
  }),

  toggleChat: (chat) => {
    const { anchorChat, selectedChats } = get();
    const next = new Map(selectedChats);

    if (next.size === 0 && anchorChat) {
      next.set(anchorChat.id, anchorChat);
    }

    if (next.has(chat.id)) {
      next.delete(chat.id);
      if (next.size === 1) {
        const remaining = [...next.values()][0];
        set({ anchorChat: remaining, selectedChats: new Map(), isMulti: false, selectedIds: undefined });
        return;
      }
      if (next.size === 0) {
        set({ anchorChat: null, selectedChats: new Map(), isMulti: false, selectedIds: undefined });
        return;
      }
    } else {
      next.set(chat.id, chat);
    }

    set({
      selectedChats: next,
      isMulti: next.size > 1,
      selectedIds: next.size > 1 ? new Set(next.keys()) : undefined,
    });
  },

  rangeSelectChat: (chat, allChats) => {
    const { anchorChat } = get();
    if (!anchorChat) {
      set({ anchorChat: chat, selectedChats: new Map(), isMulti: false, selectedIds: undefined });
      return;
    }
    const ids = allChats.map((c) => c.id);
    const anchorIdx = ids.indexOf(anchorChat.id);
    const targetIdx = ids.indexOf(chat.id);
    if (anchorIdx === -1 || targetIdx === -1) return;

    const from = Math.min(anchorIdx, targetIdx);
    const to = Math.max(anchorIdx, targetIdx);
    const next = new Map(allChats.slice(from, to + 1).map((c) => [c.id, c] as const));
    set({
      selectedChats: next,
      isMulti: next.size > 1,
      selectedIds: next.size > 1 ? new Set(next.keys()) : undefined,
    });
  },

  selectAllChats: (chats) => {
    const next = new Map(chats.map((c) => [c.id, c] as const));
    set({
      selectedChats: next,
      isMulti: next.size > 1,
      selectedIds: next.size > 1 ? new Set(next.keys()) : undefined,
    });
  },

  clearSelection: () => set({
    selectedChats: new Map(),
    isMulti: false,
    selectedIds: undefined,
  }),

  patchSelection: (chat) => {
    const { anchorChat, selectedChats } = get();
    const updates: Partial<SelectionSlice> = {};

    if (anchorChat?.id === chat.id) updates.anchorChat = chat;

    if (selectedChats.has(chat.id)) {
      const next = new Map(selectedChats);
      next.set(chat.id, chat);
      updates.selectedChats = next;
    }

    if (Object.keys(updates).length > 0) set(updates);
  },

  removeSelection: (id) => {
    const { anchorChat, selectedChats } = get();
    const updates: Partial<SelectionSlice> = {};

    if (anchorChat?.id === id) updates.anchorChat = null;

    if (selectedChats.has(id)) {
      const next = new Map(selectedChats);
      next.delete(id);
      updates.selectedChats = next;
      updates.isMulti = next.size > 1;
      updates.selectedIds = next.size > 1 ? new Set(next.keys()) : undefined;
    }

    if (Object.keys(updates).length > 0) set(updates);
  },

  setRenameChat: (chat) => set({ renameChat: chat }),
});
