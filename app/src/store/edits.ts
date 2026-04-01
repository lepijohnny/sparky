import type { StateCreator } from "zustand";

export interface EditsSlice {
  editedContent: Map<number, string>;
  setEditedContent: (rowid: number, content: string) => void;
  clearEditedContent: (rowid: number) => void;
}

export const createEditsSlice: StateCreator<EditsSlice, [], [], EditsSlice> = (set) => ({
  editedContent: new Map(),
  setEditedContent: (rowid, content) =>
    set((s) => {
      const next = new Map(s.editedContent);
      next.set(rowid, content);
      return { editedContent: next };
    }),
  clearEditedContent: (rowid) =>
    set((s) => {
      const next = new Map(s.editedContent);
      next.delete(rowid);
      return { editedContent: next };
    }),
});
