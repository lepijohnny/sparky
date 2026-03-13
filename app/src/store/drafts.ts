import type { StateCreator } from "zustand";

export interface DraftsSlice {
  drafts: Record<string, string>;
  setDraft: (chatId: string, text: string) => void;
  clearDraft: (chatId: string) => void;
}

export const createDraftsSlice: StateCreator<DraftsSlice, [], [], DraftsSlice> = (set) => ({
  drafts: {},
  setDraft: (chatId, text) => set((s) => ({ drafts: { ...s.drafts, [chatId]: text } })),
  clearDraft: (chatId) => set((s) => {
    const { [chatId]: _, ...rest } = s.drafts;
    return { drafts: rest };
  }),
});
