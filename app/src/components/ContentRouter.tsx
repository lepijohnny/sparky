import React, { useMemo } from "react";
import { useStore } from "../store";
import type { Section, SettingsSub } from "../store/types";
import type { AppNavigation } from "../hooks/useAppNavigation";
import type { WsConnection } from "../lib/ws";
import type { Chat } from "../types/chat";
import type { Source } from "../types/source";

import ChatDetailHeader from "./chat/ChatDetailHeader";
import ChatDetailsPage from "../pages/chat/ChatDetailsPage";
import ChatListPage, {
  ARCHIVED_CONFIG,
  CHAT_CONFIG,
  FLAGGED_CONFIG,
  labelsConfig,
} from "../pages/chat/ChatListPage";
import BatchActionsPage from "../pages/chat/BatchActionsPage";
import SourceListPage from "../pages/knowledge/SourceListPage";
import SourceDetailsPage from "../pages/knowledge/SourceDetailsPage";
import ConnectionsListPage from "../pages/connections/ConnectionsListPage";
import ConnectionsDetailsPage from "../pages/connections/ConnectionsDetailsPage";
import SkillsListPage from "../pages/skills/SkillsListPage";
import SkillsDetailsPage from "../pages/skills/SkillsDetailsPage";
import RoutinesListPage from "../pages/routines/RoutinesListPage";
import RoutinesDetailsPage from "../pages/routines/RoutinesDetailsPage";
import SettingsContextPage from "../pages/settings/SettingsContextPage";
import AppearanceDetailsPage from "../pages/settings/AppearanceDetailsPage";
import DebugDetailsPage from "../pages/settings/DebugDetailsPage";
import EnvironmentDetailsPage from "../pages/settings/EnvironmentDetailsPage";
import LabelsDetailsPage from "../pages/settings/LabelsDetailsPage";
import LlmDetailsPage from "../pages/settings/LlmDetailsPage";
import AboutDetailsPage from "../pages/settings/AboutDetailsPage";
import ProfileDetailsPage from "../pages/settings/ProfileDetailsPage";
import WorkspaceDetailsPage from "../pages/settings/WorkspaceDetailsPage";
import PermissionsDetailsPage from "../pages/settings/PermissionsDetailsPage";
import ConvertersDetailsPage from "../pages/settings/ConvertersDetailsPage";
import Empty from "./shared/Empty";
import EmptySection from "./shared/EmptySection";
import SourceBatchActions from "./SourceBatchActions";

const SECTION_LABELS: Record<Section, string> = {
  chats: "Chats",
  flagged: "Flagged",
  labels: "Labels",
  archived: "Archived",
  sources: "Sources",
  connections: "Connections",
  skills: "Skills",
  routines: "Routines",
  settings: "Settings",
};

const SETTINGS_SUB_LABELS: Record<SettingsSub, string> = {
  profile: "Profile",
  appearance: "Look & Feel",
  llm: "LLM",
  labels: "Labels",
  environment: "Environment",
  workspace: "Workspace",
  converters: "Converters",
  permissions: "Permissions",
  about: "About",
  debug: "Debug",
};

const SETTINGS_PAGES: Record<SettingsSub, React.FC> = {
  profile: ProfileDetailsPage,
  appearance: AppearanceDetailsPage,
  llm: LlmDetailsPage,
  labels: LabelsDetailsPage,
  environment: EnvironmentDetailsPage,
  workspace: WorkspaceDetailsPage,
  converters: ConvertersDetailsPage,
  permissions: PermissionsDetailsPage,
  about: AboutDetailsPage,
  debug: DebugDetailsPage,
};

const EMPTY_MESSAGES: Partial<Record<Section, string>> = {
  routines: "Routines run tasks automatically on a schedule. Create one to get started.",
  skills: "Skills give the assistant specialized capabilities. Import from ClawHub or create your own.",
  connections: "Connections let the assistant interact with external services like GitHub, Gmail, or Slack.",
  sources: "Sources help you build and maintain long-term knowledge. Add files, folders, or URLs to give the assistant context across conversations.",
};

export { SECTION_LABELS, SETTINGS_SUB_LABELS };

interface ContentRouterProps {
  conn: WsConnection | null;
  router: AppNavigation;
  debugUnlocked: boolean;
  showUrlInput: boolean;
  onUrlSubmit: (url: string) => Promise<void>;
  onUrlCancel: () => void;
  onRename: (chat: Chat) => void;
  onDelete: () => void;
}

export interface ContentRouterResult {
  contextContent: React.ReactNode;
  detailsTitle: React.ReactNode;
  detailsContent: React.ReactNode;
}

export function useContentRouter({
  conn,
  router,
  debugUnlocked,
  showUrlInput,
  onUrlSubmit,
  onUrlCancel,
  onRename,
  onDelete,
}: ContentRouterProps): ContentRouterResult {
  const { section, settingsSub, selectedLabel, searching, searchQuery } = router;

  const selectedChat = useStore((s) => s.anchorChat);
  const selectedIds = useStore((s) => s.selectedIds);
  const selectedChats = useStore((s) => s.selectedChats);
  const isMulti = useStore((s) => s.isMulti);
  const selectChat = useStore((s) => s.selectChat);
  const toggleChat = useStore((s) => s.toggleChat);
  const rangeSelectChat = useStore((s) => s.rangeSelectChat);
  const selectAllChats = useStore((s) => s.selectAllChats);
  const clearSelection = useStore((s) => s.clearSelection);

  const sources = useStore((s) => s.sources);
  const selectedSourceId = useStore((s) => s.selectedSourceId);
  const selectSingleSource = useStore((s) => s.selectSingleSource);
  const toggleSource = useStore((s) => s.toggleSource);
  const rangeSelectSource = useStore((s) => s.rangeSelectSource);
  const selectAllSources = useStore((s) => s.selectAllSources);
  const clearSourceSelection = useStore((s) => s.clearSourceSelection);
  const isSourceMulti = useStore((s) => s.isSourceMulti);
  const sourceSelectedIds = useStore((s) => s.sourceSelectedIds);
  const selectedSources = useStore((s) => s.selectedSources);

  const selectedConnectionId = useStore((s) => s.selectedConnectionId);
  const selectConnection = useStore((s) => s.selectConnection);
  const selectedSkillId = useStore((s) => s.selectedSkillId);
  const selectSkill = useStore((s) => s.selectSkill);
  const selectedRoutineId = useStore((s) => s.selectedRoutineId);
  const selectRoutine = useStore((s) => s.selectRoutine);

  const selectedSource = sources.find((s) => s.id === selectedSourceId) ?? null;

  const chatListProps = useMemo(() => ({
    selectedChatId: selectedChat?.id ?? null,
    multiSelectedIds: selectedIds,
    onSelectChat: selectChat,
    onToggleSelect: toggleChat,
    onRangeSelect: rangeSelectChat,
    onSelectAll: selectAllChats,
    onRenameChat: onRename,
    searching,
    onSearchClose: () => router.setSearching(false),
    onSearchQueryChange: router.setSearchQuery,
  }), [selectedChat?.id, selectedIds, selectChat, toggleChat, rangeSelectChat, selectAllChats, onRename, searching, router]);

  let contextContent: React.ReactNode;
  let detailsTitle: React.ReactNode = SECTION_LABELS[section];
  let detailsContent: React.ReactNode = <Empty message="Select an item to view details." />;

  if (section === "settings") {
    contextContent = <SettingsContextPage activeSub={settingsSub} onSubChange={router.handleSettingsSubChange} debugUnlocked={debugUnlocked} />;
    detailsTitle = SETTINGS_SUB_LABELS[settingsSub];
    const SettingsPage = SETTINGS_PAGES[settingsSub];
    detailsContent = <SettingsPage />;
  } else if (section === "chats" || section === "flagged" || section === "labels" || section === "archived") {
    const chatConfig = section === "chats" ? CHAT_CONFIG
      : section === "flagged" ? FLAGGED_CONFIG
      : section === "archived" ? ARCHIVED_CONFIG
      : labelsConfig(selectedLabel);
    contextContent = <ChatListPage config={chatConfig} {...chatListProps} />;
  } else if (section === "sources") {
    contextContent = (
      <SourceListPage
        selectedSourceId={selectedSource?.id ?? null}
        onSelectSource={(source) => { selectSingleSource(source); }}
        onToggleSelect={toggleSource}
        onRangeSelect={rangeSelectSource}
        onSelectAll={selectAllSources}
        multiSelectedIds={sourceSelectedIds}
        showUrlInput={showUrlInput}
        onUrlSubmit={onUrlSubmit}
        onUrlCancel={onUrlCancel}
      />
    );
  } else if (section === "connections") {
    contextContent = (
      <ConnectionsListPage
        selectedConnectionId={selectedConnectionId}
        onSelectConnection={selectConnection}
      />
    );
  } else if (section === "skills") {
    contextContent = (
      <SkillsListPage
        selectedSkillId={selectedSkillId}
        onSelectSkill={selectSkill}
      />
    );
  } else if (section === "routines") {
    contextContent = (
      <RoutinesListPage
        selectedId={selectedRoutineId}
        onSelect={selectRoutine}
        onDeleted={() => selectRoutine("")}
      />
    );
  } else {
    contextContent = <Empty message="Nothing here yet." />;
  }

  const batchChats = useMemo(() => [...selectedChats.values()], [selectedChats]);

  if (section === "sources" && isSourceMulti) {
    const batchSources = [...selectedSources.values()];
    detailsTitle = `${selectedSources.size} sources selected`;
    detailsContent = (
      <SourceBatchActions
        sources={batchSources}
        onClear={() => { clearSourceSelection(); }}
      />
    );
  } else if (section !== "settings" && isMulti) {
    detailsTitle = `${selectedChats.size} chats selected`;
    detailsContent = <BatchActionsPage chats={batchChats} onClear={clearSelection} />;
  } else if (section === "sources" && selectedSource) {
    detailsTitle = selectedSource.name;
    detailsContent = <SourceDetailsPage key={selectedSource.id} source={selectedSource} onDelete={() => selectSingleSource(null)} />;
  } else if (section === "connections" && selectedConnectionId) {
    detailsTitle = selectedConnectionId.charAt(0).toUpperCase() + selectedConnectionId.slice(1);
    detailsContent = <ConnectionsDetailsPage connectionId={selectedConnectionId} />;
  } else if (section === "skills" && selectedSkillId) {
    const skill = useStore.getState().skills.find((s) => s.id === selectedSkillId);
    detailsTitle = skill?.name ?? selectedSkillId;
    detailsContent = <SkillsDetailsPage key={selectedSkillId} skillId={selectedSkillId} />;
  } else if (section === "routines" && selectedRoutineId) {
    detailsTitle = "Routine";
    detailsContent = <RoutinesDetailsPage routineId={selectedRoutineId}
      onOpenChat={(chatId) => {
        conn?.request<{ chat: Chat }>("chat.get.id", { id: chatId }).then((r) => {
          if (r?.chat) { selectChat(r.chat); router.handleSectionChange("chats"); }
        }).catch(() => {});
      }}
      onEditAssistant={(routine) => {
        if (!conn) return;
        conn.request<{ chatId: string }>("chat.system.ask", {
          content: `I want to edit the routine "${routine.name}" (id: ${routine.id}).`,
          kind: "routines",
        }).then((res) => {
          if (section !== "chats") router.handleSectionChange("chats");
          conn.request<{ chat: Chat }>("chat.get.id", { id: res.chatId }).then((r) => {
            if (r?.chat) selectChat(r.chat);
          }).catch(() => {});
        }).catch(() => {});
      }}
      onDeleted={() => selectRoutine(null)}
    />;
  } else if (EMPTY_MESSAGES[section]) {
    detailsTitle = "";
    detailsContent = <EmptySection message={EMPTY_MESSAGES[section]!} />;
  } else if (section !== "settings" && selectedChat) {
    detailsTitle = <ChatDetailHeader chat={selectedChat} onRename={onRename} onDelete={onDelete} />;
    detailsContent = <ChatDetailsPage key={selectedChat.id} chat={selectedChat} searchQuery={searching ? searchQuery : undefined} />;
  }

  return { contextContent, detailsTitle, detailsContent };
}
