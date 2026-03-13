import type { StateCreator } from "zustand";
import type { Source } from "../types/source";

export interface SourcesSlice {
  sources: Source[];
  selectedSourceId: string | null;

  setSources: (sources: Source[]) => void;
  selectSource: (id: string | null) => void;
  patchSource: (source: Source) => void;
  removeSource: (id: string) => void;
}

export const createSourcesSlice: StateCreator<SourcesSlice, [], [], SourcesSlice> = (set) => ({
  sources: [],
  selectedSourceId: null,

  setSources: (sources) => set({ sources }),

  selectSource: (id) => set({ selectedSourceId: id }),

  patchSource: (source) =>
    set((s) => {
      const idx = s.sources.findIndex((x) => x.id === source.id);
      if (idx === -1) return { sources: [...s.sources, source] };
      const next = [...s.sources];
      next[idx] = source;
      return { sources: next };
    }),

  removeSource: (id) =>
    set((s) => {
      const next = s.sources.filter((x) => x.id !== id);
      if (next.length === s.sources.length) return s;
      const updates: Partial<SourcesSlice> = { sources: next };
      if (s.selectedSourceId === id) updates.selectedSourceId = null;
      return updates;
    }),
});
