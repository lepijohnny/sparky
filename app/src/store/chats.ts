import type { StateCreator } from "zustand";
import type { Chat } from "../types/chat";

function sortByUpdated(chats: Chat[]): Chat[] {
  return [...chats].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface ChatsSlice {
  chats: Chat[];

  setChats: (chats: Chat[]) => void;
  addChat: (chat: Chat) => void;
  patchChat: (chat: Chat) => void;
  removeChat: (id: string) => void;

  getFirstChat: () => Chat | null;
  getChatById: (id: string) => Chat | null;
  getChatCounts: () => ChatCounts;
}

export interface ChatCounts {
  chats: number;
  flagged: number;
  archived: number;
  labeled: number;
  labels: Record<string, number>;
}

export const createChatsSlice: StateCreator<ChatsSlice, [], [], ChatsSlice> = (set, get) => ({
  chats: [],

  setChats: (chats) => set({ chats: sortByUpdated(chats) }),

  addChat: (chat) =>
    set((s) => {
      if (s.chats.some((c) => c.id === chat.id)) return s;
      return { chats: sortByUpdated([chat, ...s.chats]) };
    }),

  patchChat: (chat) =>
    set((s) => {
      const idx = s.chats.findIndex((c) => c.id === chat.id);
      if (idx === -1) return { chats: sortByUpdated([chat, ...s.chats]) };
      const next = [...s.chats];
      next[idx] = chat;
      return { chats: sortByUpdated(next) };
    }),

  removeChat: (id) =>
    set((s) => {
      const next = s.chats.filter((c) => c.id !== id);
      if (next.length === s.chats.length) return s;
      return { chats: next };
    }),

  getFirstChat: () => get().chats.find((c) => !c.archived) ?? null,
  getChatById: (id) => get().chats.find((c) => c.id === id) ?? null,
  getChatCounts: () => {
    const { chats } = get();
    let flagged = 0, archived = 0, labeled = 0;
    const labels: Record<string, number> = {};
    for (const c of chats) {
      if (c.archived) { archived++; continue; }
      if (c.flagged) flagged++;
      const userLabels = c.labels?.filter((id) => !id.startsWith("_"));
      if (userLabels?.length) {
        labeled++;
        for (const l of userLabels) labels[l] = (labels[l] ?? 0) + 1;
      }
    }
    return { chats: chats.length - archived, flagged, archived, labeled, labels };
  },
});
