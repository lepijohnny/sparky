import type { StateCreator } from "zustand";
import type { Source } from "../types/source";

export interface SourceSelectionSlice {
  selectedSources: Map<string, Source>;
  isSourceMulti: boolean;
  sourceSelectedIds: Set<string> | undefined;

  selectSingleSource: (source: Source | null) => void;
  toggleSource: (source: Source) => void;
  rangeSelectSource: (source: Source, allSources: Source[]) => void;
  selectAllSources: (sources: Source[]) => void;
  clearSourceSelection: () => void;
}

export const createSourceSelectionSlice: StateCreator<SourceSelectionSlice, [], [], SourceSelectionSlice> = (set, get) => {
  function derive(map: Map<string, Source>): Pick<SourceSelectionSlice, "isSourceMulti" | "sourceSelectedIds"> {
    return {
      isSourceMulti: map.size > 1,
      sourceSelectedIds: map.size > 1 ? new Set(map.keys()) : undefined,
    };
  }

  return {
    selectedSources: new Map(),
    isSourceMulti: false,
    sourceSelectedIds: undefined,

    selectSingleSource: (source) => {
      set({
        selectedSources: new Map(),
        isSourceMulti: false,
        sourceSelectedIds: undefined,
        selectedSourceId: source?.id ?? null,
      });
    },

    toggleSource: (source) => {
      const { selectedSources, selectedSourceId } = get() as any;
      const next = new Map(selectedSources);

      if (next.size === 0 && selectedSourceId) {
        const existing = (get() as any).sources?.find((s: Source) => s.id === selectedSourceId);
        if (existing) next.set(existing.id, existing);
      }

      if (next.has(source.id)) {
        next.delete(source.id);
        if (next.size === 1) {
          const remaining = [...next.values()][0];
          set({ selectedSources: new Map(), selectedSourceId: remaining.id, ...derive(new Map()) });
          return;
        }
        if (next.size === 0) {
          set({ selectedSources: new Map(), selectedSourceId: null, ...derive(new Map()) });
          return;
        }
      } else {
        next.set(source.id, source);
      }

      set({ selectedSources: next, ...derive(next) });
    },

    rangeSelectSource: (source, allSources) => {
      const { selectedSourceId } = get() as any;
      if (!selectedSourceId) {
        set({ selectedSourceId: source.id, selectedSources: new Map(), ...derive(new Map()) });
        return;
      }
      const ids = allSources.map((s) => s.id);
      const anchorIdx = ids.indexOf(selectedSourceId);
      const targetIdx = ids.indexOf(source.id);
      if (anchorIdx === -1 || targetIdx === -1) return;

      const from = Math.min(anchorIdx, targetIdx);
      const to = Math.max(anchorIdx, targetIdx);
      const next = new Map(allSources.slice(from, to + 1).map((s) => [s.id, s] as const));
      set({ selectedSources: next, ...derive(next) });
    },

    selectAllSources: (sources) => {
      const next = new Map(sources.map((s) => [s.id, s] as const));
      set({ selectedSources: next, ...derive(next) });
    },

    clearSourceSelection: () => set({
      selectedSources: new Map(),
      isSourceMulti: false,
      sourceSelectedIds: undefined,
    }),
  };
};
