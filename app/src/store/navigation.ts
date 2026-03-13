import type { StateCreator } from "zustand";
import type { Section, SettingsSub } from "./types";

export interface NavigationSlice {
  section: Section;
  settingsSub: SettingsSub;
  selectedLabel: string | null;
  searching: boolean;
  searchQuery: string;
  collapsedGroups: Set<string>;
  focusMode: boolean;

  setSection: (s: Section) => void;
  setSettingsSub: (sub: SettingsSub) => void;
  setSelectedLabel: (id: string | null) => void;
  setSearching: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  toggleCollapsedGroup: (label: string) => void;
  toggleFocusMode: () => void;
}

export const createNavigationSlice: StateCreator<NavigationSlice, [], [], NavigationSlice> = (set) => ({
  section: "chats",
  settingsSub: "appearance",
  selectedLabel: null,
  searching: false,
  searchQuery: "",
  collapsedGroups: new Set(),
  focusMode: false,

  setSection: (s) =>
    set((prev) => {
      if (prev.section === s) return prev;
      return {
        section: s,
        searching: false,
        searchQuery: "",
        selectedLabel: s === "labels" ? prev.selectedLabel : null,
      };
    }),

  setSettingsSub: (sub) => set({ settingsSub: sub }),
  setSelectedLabel: (id) => set({ selectedLabel: id }),
  setSearching: (v) => set({ searching: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  toggleFocusMode: () => set((prev) => ({ focusMode: !prev.focusMode })),

  toggleCollapsedGroup: (label) =>
    set((prev) => {
      const next = new Set(prev.collapsedGroups);
      if (next.has(label)) next.delete(label); else next.add(label);
      return { collapsedGroups: next };
    }),
});
