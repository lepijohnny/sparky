import { useCallback } from "react";
import type { Section, SettingsSub } from "../store/types";
import { useStore } from "../store";

export interface AppNavigation {
  section: Section;
  settingsSub: SettingsSub;
  selectedLabel: string | null;
  searching: boolean;
  searchQuery: string;
  setSearching: (v: boolean) => void;
  setSearchQuery: (v: string) => void;
  handleSectionChange: (s: Section) => void;
  handleSettingsSubChange: (sub: SettingsSub) => void;
  handleLabelSelect: (labelId: string | null) => void;
}

/**
 * Top-level navigation — thin wrapper over the store's navigation slice.
 * Adds multi-select collapse logic on section change.
 */
export function useAppNavigation(): AppNavigation {
  const section = useStore((s) => s.section);
  const settingsSub = useStore((s) => s.settingsSub);
  const selectedLabel = useStore((s) => s.selectedLabel);
  const searching = useStore((s) => s.searching);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearching = useStore((s) => s.setSearching);
  const setSearchQuery = useStore((s) => s.setSearchQuery);

  const handleSectionChange = useCallback((s: Section) => {
    const store = useStore.getState();

    if (store.isMulti) {
      const first = [...store.selectedChats.values()][0];
      store.selectChat(first ?? null);
    }

    if (store.isSourceMulti) {
      store.clearSourceSelection();
    }

    const isChatSection = s === "chats" || s === "flagged" || s === "labels" || s === "archived";
    if (isChatSection && !store.anchorChat) {
      const first = store.getFirstChat();
      if (first) store.selectChat(first);
    }

    store.setSection(s);
  }, []);

  const handleSettingsSubChange = useCallback((sub: SettingsSub) => {
    useStore.getState().setSettingsSub(sub);
  }, []);

  const handleLabelSelect = useCallback((labelId: string | null) => {
    useStore.getState().setSelectedLabel(labelId);
  }, []);

  return {
    section,
    settingsSub,
    selectedLabel,
    searching,
    searchQuery,
    setSearching,
    setSearchQuery,
    handleSectionChange,
    handleSettingsSubChange,
    handleLabelSelect,
  };
}
