import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createNavigationSlice, type NavigationSlice } from "./navigation";
import { createChatsSlice, type ChatsSlice } from "./chats";
import { createSourcesSlice, type SourcesSlice } from "./sources";
import { createConnectionsSlice, type ConnectionsSlice } from "./connections";
import { createLabelsSlice, type LabelsSlice } from "./labels";
import { createAgentSlice, type AgentSlice } from "./agent";
import { createStreamsSlice, type StreamsSlice } from "./streams";
import { createSelectionSlice, type SelectionSlice } from "./selection";
import { createSourceSelectionSlice, type SourceSelectionSlice } from "./sourceSelection";
import { createWorkspaceSlice, type WorkspaceSlice } from "./workspace";
import { createTrustSlice, type TrustSlice } from "./trust";
import { createSkillsSlice, type SkillsSlice } from "./skills";
import { createUpdaterSlice, type UpdaterSlice } from "./updater";

export type AppState =
  & NavigationSlice
  & ChatsSlice
  & SourcesSlice
  & ConnectionsSlice
  & LabelsSlice
  & AgentSlice
  & StreamsSlice
  & SelectionSlice
  & SourceSelectionSlice
  & WorkspaceSlice
  & TrustSlice
  & SkillsSlice
  & UpdaterSlice;

export const useStore = create<AppState>()(
  persist(
    (...a) => ({
      ...createNavigationSlice(...a),
      ...createChatsSlice(...a),
      ...createSourcesSlice(...a),
      ...createConnectionsSlice(...a),
      ...createLabelsSlice(...a),
      ...createAgentSlice(...a),
      ...createStreamsSlice(...a),
      ...createSelectionSlice(...a),
      ...createSourceSelectionSlice(...a),
      ...createWorkspaceSlice(...a),
      ...createTrustSlice(...a),
      ...createSkillsSlice(...a),
      ...createUpdaterSlice(...a),
    }),
    {
      name: "sparky-app",
      partialize: (s) => ({
        settingsSub: s.settingsSub,
        selectedSourceId: s.selectedSourceId,
        selectedConnectionId: s.selectedConnectionId,
        selectedLabel: s.selectedLabel,
      }),
      storage: {
        getItem: (name) => {
          try { const v = localStorage.getItem(name); return v ? JSON.parse(v) : null; }
          catch { return null; }
        },
        setItem: (name, value) => {
          try { localStorage.setItem(name, JSON.stringify(value)); } catch {}
        },
        removeItem: (name) => {
          try { localStorage.removeItem(name); } catch {}
        },
      },
    },
  ),
);

export type { Section, SettingsSub } from "./types";
export type { ChatCounts } from "./chats";
