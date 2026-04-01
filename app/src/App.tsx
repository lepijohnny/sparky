import { Download, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./App.module.css";
import shared from "./styles/shared.module.css";
import ChatDetailHeader from "./components/chat/ChatDetailHeader";
import RenameModal from "./components/modals/RenameModal";

import AssistantAsk from "./components/shared/AssistantAsk";
import Empty from "./components/shared/Empty";
import InlineMenu from "./components/shared/InlineMenu";
import ConnectionError from "./components/shared/ConnectionError";
import SplashScreen from "./components/shared/SplashScreen";
import OnboardingPage from "./pages/onboarding/OnboardingPage";

import { useConnection } from "./context/ConnectionContext";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useStore } from "./store";
import { useToasts } from "./context/ToastContext";

let bgToastId = 0;
import Layout from "./layouts/Layout";
import BatchActionsPage from "./pages/chat/BatchActionsPage";
import batchStyles from "./pages/chat/BatchActionsPage.module.css";
import ChatDetailsPage from "./pages/chat/ChatDetailsPage";
import ChatListPage, {
  ARCHIVED_CONFIG,
  CHAT_CONFIG,
  FLAGGED_CONFIG,
  labelsConfig,
} from "./pages/chat/ChatListPage";
import AppearanceDetailsPage from "./pages/settings/AppearanceDetailsPage";
import DebugDetailsPage from "./pages/settings/DebugDetailsPage";
import EnvironmentDetailsPage from "./pages/settings/EnvironmentDetailsPage";
import LabelsDetailsPage from "./pages/settings/LabelsDetailsPage";
import LlmDetailsPage from "./pages/settings/LlmDetailsPage";
import SettingsContextPage, { type SettingsSub } from "./pages/settings/SettingsContextPage";
import AboutDetailsPage from "./pages/settings/AboutDetailsPage";
import ProfileDetailsPage from "./pages/settings/ProfileDetailsPage";
import WorkspaceDetailsPage from "./pages/settings/WorkspaceDetailsPage";
import PermissionsDetailsPage from "./pages/settings/PermissionsDetailsPage";
import ConvertersDetailsPage from "./pages/settings/ConvertersDetailsPage";
import SourceAddButton from "./components/knowledge/SourceAddButton";
import SourceListPage from "./pages/knowledge/SourceListPage";
import SourceDetailsPage from "./pages/knowledge/SourceDetailsPage";
import ConnectionsListPage from "./pages/connections/ConnectionsListPage";
import ConnectionsDetailsPage from "./pages/connections/ConnectionsDetailsPage";
import SkillsListPage from "./pages/skills/SkillsListPage";
import SkillsDetailsPage from "./pages/skills/SkillsDetailsPage";
import RoutinesListPage from "./pages/routines/RoutinesListPage";
import RoutinesDetailsPage from "./pages/routines/RoutinesDetailsPage";
import ContextPanel from "./panels/ContextPanel";
import DetailsPanel from "./panels/DetailsPanel";
import MenuPanel, { type Section } from "./panels/MenuPanel";
import type { Chat } from "./types/chat";
import type { Source } from "./types/source";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useWsSubscriber } from "./hooks/useWsSubscriber";
import { setMarkReadCallback } from "./store/selection";

function SourceBatchActions({ sources, onClear }: { sources: Source[]; onClear: () => void }) {
  const { conn } = useConnection();
  const handleDelete = useCallback(async () => {
    if (!conn) return;
    for (const s of sources) {
      await conn.request("kt.sources.delete", { id: s.id });
    }
    onClear();
  }, [conn, sources, onClear]);

  const actions: import("./components/shared/ContextMenu").ContextMenuAction[] = [
    {
      label: "Delete",
      icon: <Trash2 size={12} strokeWidth={1.5} />,
      danger: true,
      onClick: handleDelete,
    },
  ];

  return (
    <div className={batchStyles.container}>
      <div className={batchStyles.badge}>{sources.length}</div>
      <span className={batchStyles.hint}>sources selected</span>
      <InlineMenu actions={actions} />
    </div>
  );
}

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

export default function App() {
  const { conn, wsStatus, wsPort, openLogs } = useConnection();

  const {
    labels, anchorChat: selectedChat, isMulti, selectedIds, selectedChats,
    selectChat, toggleChat, rangeSelectChat, selectAllChats, clearSelection,
    renameChat, setRenameChat,
    sources, selectedSourceId, selectSingleSource, toggleSource,
    rangeSelectSource, selectAllSources, clearSourceSelection,
    isSourceMulti, sourceSelectedIds, selectedSources,
    selectedConnectionId, selectConnection,
    selectedSkillId, selectSkill,
    selectedRoutineId, selectRoutine,
  } = useStore((s) => s);

  const llmConnections = useStore((s) => s.llmConnections);
  const booted = useStore((s) => s.booted);
  const defaultLlm = useStore((s) => s.defaultLlm);
  const providers = useStore((s) => s.providers);
  const defaultConn = useMemo(() => useStore.getState().getDefaultConn(), [llmConnections, defaultLlm]);
  const toolsSupported = useMemo(() => useStore.getState().getSelectedModel()?.supportsTools ?? false, [llmConnections, defaultLlm, providers]);
  const selectedSource = sources.find((s) => s.id === selectedSourceId) ?? null;

  const router = useAppNavigation();
  const { section, settingsSub, selectedLabel, searching, searchQuery, setSearching, setSearchQuery } = router;

  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [showConnectionAsk, setShowConnectionAsk] = useState(false);
  const [showSkillsAsk, setShowSkillsAsk] = useState(false);
  const [connTimeout, setConnTimeout] = useState(false);

  useEffect(() => {
    if (wsStatus === "connected") { setConnTimeout(false); return; }
    const t = setTimeout(() => setConnTimeout(true), 15000);
    return () => clearTimeout(t);
  }, [wsStatus]);
  const [connectionAskPos, setConnectionAskPos] = useState({ x: 0, y: 0 });
  const connectionPlusRef = useRef<HTMLButtonElement>(null);
  const [skillsAskPos, setSkillsAskPos] = useState({ x: 0, y: 0 });
  const skillsPlusRef = useRef<HTMLButtonElement>(null);
  const [showRoutinesAsk, setShowRoutinesAsk] = useState(false);
  const [routinesAskPos, setRoutinesAskPos] = useState({ x: 0, y: 0 });
  const routinesPlusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!conn) return;
    setMarkReadCallback((chatId) => conn.request("chat.unread", { id: chatId, unread: false }));
    return () => setMarkReadCallback(() => {});
  }, [conn]);

  const { addToast } = useToasts();

  useWsSubscriber<{ chatId: string; kind: string; type?: string }>(conn, "chat.event", useCallback((event) => {
    if (event.kind !== "activity") return;
    if (event.type !== "agent.done" && event.type !== "agent.error") return;
    const store = useStore.getState();
    if (event.chatId === store.anchorChat?.id) return;
    const name = store.getChatById(event.chatId)?.name || "Chat";

    addToast({
      id: `bg_${++bgToastId}`,
      kind: event.type === "agent.error" ? "error" : "info",
      title: `Reply ready, "${name}"`,
      expire: true,
    });
  }, [addToast]));

  useWsSubscriber<{ label: string }>(conn, "trust.rule.added", useCallback((data) => {
    addToast({
      id: `perm_${Date.now()}`,
      kind: "success",
      title: `Permission added: ${data.label}`,
      expire: false,
      action: {
        label: "Go to Permissions →",
        onClick: () => {
          router.handleSectionChange("settings");
          router.handleSettingsSubChange("permissions");
        },
      },
    });
  }, [addToast, router]));

  useWsSubscriber<{ id: string; name: string }>(conn, "skills.created", useCallback((data) => {
    addToast({
      id: `skill_created_${data.id}`,
      kind: "success",
      title: `Skill "${data.name}" created`,
      expire: false,
      action: {
        label: "Go to Skills →",
        onClick: () => {
          router.handleSectionChange("skills");
          selectSkill(data.id);
        },
      },
    });
  }, [addToast, router, selectSkill]));

  useWsSubscriber<{ service: string }>(conn, "svc.guide", useCallback((data) => {
    const label = data.service.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    addToast({
      id: `svc_guide_${data.service}`,
      kind: "success",
      title: `${label} connected`,
      expire: false,
      action: {
        label: "Go to Connections →",
        onClick: () => {
          router.handleSectionChange("connections");
          selectConnection(data.service);
        },
      },
    });
  }, [addToast, router, selectConnection]));

  useWsSubscriber<{ source: Source }>(conn, "kt.source.updated", useCallback((data) => {
    if (data.source.status === "ready") {
      addToast({ id: `kt-done-${data.source.id}`, kind: "success", title: `"${data.source.name}" imported` });
    } else if (data.source.status === "error") {
      addToast({ id: `kt-fail-${data.source.id}`, kind: "error", title: `"${data.source.name}" import failed`, message: data.source.error });
    }
  }, [addToast]));

  const handleAddFile = useCallback(async () => {
    if (!conn) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const res = await conn.request<{ extensions: string[] }>("kt.sources.extensions");
      const extensions = res.extensions.map((e) => e.replace(/^\./, ""));
      const selected = await open({
        multiple: false,
        filters: extensions.length > 0
          ? [{ name: "Supported files", extensions }]
          : undefined,
      });
      if (selected) {
        await conn.request("kt.sources.add.file", { path: selected });
      }
    } catch (err: any) {
      addToast({ id: `kt-err-${Date.now()}`, kind: "error", title: err?.message ?? String(err) });
    }
  }, [conn, addToast]);

  const handleAddFolder = useCallback(async () => {
    if (!conn) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true });
      if (selected) {
        await conn.request("kt.sources.add.folder", { path: selected });
      }
    } catch (err: any) {
      addToast({ id: `kt-err-${Date.now()}`, kind: "error", title: err?.message ?? String(err) });
    }
  }, [conn, addToast]);

  const handleAddUrl = useCallback(() => {
    setShowUrlInput(true);
  }, []);

  const handleUrlSubmit = useCallback(async (url: string) => {
    setShowUrlInput(false);
    if (!conn) return;
    try {
      await conn.request("kt.sources.add.url", { url });
    } catch (err: any) {
      addToast({ id: `kt-err-${Date.now()}`, kind: "error", title: err?.message ?? String(err) });
    }
  }, [conn, addToast]);

  // ── Handlers ──

  const handleNewChat = useCallback(async () => {
    if (!conn) return;
    try {
      const res = await conn.request<{ chat: Chat }>("chat.create", { unread: false });
      selectChat(res.chat);
      if (section !== "chats") router.handleSectionChange("chats");
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  }, [conn, selectChat, section, router.handleSectionChange]);

  const handleConnectionAsk = useCallback(async (content: string) => {
    if (!conn) return;
    try {
      const res = await conn.request<{ chatId: string }>("chat.system.ask", { content, kind: "connection" });
      if (section !== "chats") router.handleSectionChange("chats");
      conn.request<{ chat: Chat }>("chat.get.id", { id: res.chatId }).then((r) => {
        if (r?.chat) selectChat(r.chat);
      }).catch(() => {});
    } catch (err) {
      console.error("Connection ask failed:", err);
    }
  }, [conn, selectChat, section, router.handleSectionChange]);

  const handleSkillsAsk = useCallback(async (content: string) => {
    if (!conn) return;
    try {
      const res = await conn.request<{ chatId: string }>("chat.system.ask", { content, kind: "skills" });
      if (section !== "chats") router.handleSectionChange("chats");
      conn.request<{ chat: Chat }>("chat.get.id", { id: res.chatId }).then((r) => {
        if (r?.chat) selectChat(r.chat);
      }).catch(() => {});
    } catch (err) {
      console.error("Skills ask failed:", err);
    }
  }, [conn, selectChat, section, router.handleSectionChange]);

  const handleRoutinesAsk = useCallback(async (content: string) => {
    if (!conn) return;
    try {
      const res = await conn.request<{ chatId: string }>("chat.system.ask", { content, kind: "routines" });
      if (section !== "chats") router.handleSectionChange("chats");
      conn.request<{ chat: Chat }>("chat.get.id", { id: res.chatId }).then((r) => {
        if (r?.chat) selectChat(r.chat);
      }).catch(() => {});
    } catch (err) {
      console.error("Routines ask failed:", err);
    }
  }, [conn, selectChat, section, router.handleSectionChange]);

  const handleImportSkill = useCallback(async () => {
    if (!conn) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [{ name: "Skill archive", extensions: ["zip"] }],
      });
      if (!selected) return;
      const res = await conn.request<{ skill: any; chatId?: string }>("skills.import", { path: selected });
      addToast({ id: `skill-import-${Date.now()}`, kind: "success", title: "Skill imported — review started" });
      if (res.chatId) {
        if (section !== "chats") router.handleSectionChange("chats");
        conn.request<{ chat: Chat }>("chat.get.id", { id: res.chatId }).then((r) => {
          if (r?.chat) selectChat(r.chat);
        }).catch(() => {});
      }
    } catch (err: any) {
      addToast({ id: `skill-import-err-${Date.now()}`, kind: "error", title: err?.message ?? String(err) });
    }
  }, [conn, addToast, section, router, selectChat]);

  const handleRename = useCallback((c: Chat) => setRenameChat(c), [setRenameChat]);
  const handleDelete = useCallback(() => selectChat(null), [selectChat]);
  const handleSearchClose = useCallback(() => setSearching(false), [setSearching]);

  const shortcutActions = useMemo(() => ({
    onNewChat: () => handleNewChat(),
    onDeleteChat: () => {
      if (!conn || !selectedChat) return;
      conn.request("chat.delete", { id: selectedChat.id });
      selectChat(null);
    },
    onPrintChat: async () => {
      if (!selectedChat || !wsPort) return;
      const { openPrintWindow } = await import("./lib/chatActions");
      openPrintWindow(selectedChat, wsPort, conn?.token ?? "");
    },
    onSearch: () => setSearching(true),
  }), [handleNewChat, conn, selectedChat, selectChat, wsPort, setSearching]);

  useKeyboardShortcuts(shortcutActions);

  // ── Content routing ──

  const chatListProps = useMemo(() => ({
    selectedChatId: selectedChat?.id ?? null,
    multiSelectedIds: selectedIds,
    onSelectChat: selectChat,
    onToggleSelect: toggleChat,
    onRangeSelect: rangeSelectChat,
    onSelectAll: selectAllChats,
    onRenameChat: handleRename,
    searching,
    onSearchClose: handleSearchClose,
    onSearchQueryChange: setSearchQuery,
  }), [selectedChat?.id, selectedIds, selectChat, toggleChat, rangeSelectChat, selectAllChats, handleRename, searching, handleSearchClose, setSearchQuery]);

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
        onUrlSubmit={handleUrlSubmit}
        onUrlCancel={() => setShowUrlInput(false)}
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

  // Batch actions override details when multi-selecting
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
  } else if (section === "routines") {
    detailsTitle = "";
    detailsContent = (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <span style={{ color: "var(--fg-muted)", fontSize: 13, fontStyle: "italic", lineHeight: 1.6, maxWidth: 320 }}>
          Routines run tasks automatically on a schedule. Create one to get started.
        </span>
      </div>
    );
  } else if (section === "skills") {
    detailsTitle = "";
    detailsContent = (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <span style={{ color: "var(--fg-muted)", fontSize: 13, fontStyle: "italic", lineHeight: 1.6, maxWidth: 320 }}>
          Skills give the assistant specialized capabilities. Import from ClawHub or create your own.
        </span>
      </div>
    );
  } else if (section === "connections") {
    detailsTitle = "";
    detailsContent = (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <span style={{ color: "var(--fg-muted)", fontSize: 13, fontStyle: "italic", lineHeight: 1.6, maxWidth: 320 }}>
          Connections let the assistant interact with external services like GitHub, Gmail, or Slack.
        </span>
      </div>
    );
  } else if (section === "sources") {
    detailsTitle = "";
    detailsContent = (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <span style={{ color: "var(--fg-muted)", fontSize: 13, fontStyle: "italic", lineHeight: 1.6, maxWidth: 320 }}>
          Sources help you build and maintain long-term knowledge. Add files, folders, or URLs to give the assistant context across conversations.
        </span>
      </div>
    );
  } else if (section === "connections") {
    detailsTitle = "";
    detailsContent = (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
        <span style={{ color: "var(--fg-muted)", fontSize: 13, fontStyle: "italic", lineHeight: 1.6, maxWidth: 320 }}>
          Connect external services like GitHub, Linear, Gmail, and more. The assistant can use these connections to search, read, and take actions on your behalf.
        </span>
      </div>
    );
  } else if (section !== "settings" && section !== "sources" && section !== "connections" && selectedChat) {
    detailsTitle = <ChatDetailHeader chat={selectedChat} onRename={handleRename} onDelete={handleDelete} />;
    detailsContent = <ChatDetailsPage key={selectedChat.id} chat={selectedChat} searchQuery={searching ? searchQuery : undefined} />;
  }

  return (
    <>
      <SplashScreen />
      {!booted && connTimeout && wsStatus === "disconnected" && <ConnectionError />}
      {booted && llmConnections.length === 0 && <OnboardingPage />}
      <Layout

        menu={
          <MenuPanel
            wsStatus={wsStatus}
            wsPort={wsPort}
            section={section}
            selectedLabel={selectedLabel}
            labels={labels}
            debugUnlocked={debugUnlocked}
            onSectionChange={router.handleSectionChange}
            onLabelSelect={router.handleLabelSelect}
            onNewChat={handleNewChat}
            onOpenLogs={openLogs}
            onDebugUnlock={() => setDebugUnlocked(true)}
          />
        }
        context={
          <ContextPanel
            title={SECTION_LABELS[section]}
            contentKey={section}
            action={section === "sources" ? (
              <SourceAddButton onFile={handleAddFile} onFolder={handleAddFolder} onUrl={handleAddUrl} />
            ) : section === "connections" ? (
              <button
                ref={connectionPlusRef}
                className={styles.searchBtn}
                onClick={() => {
                  const rect = connectionPlusRef.current?.getBoundingClientRect();
                  if (rect) setConnectionAskPos({ x: rect.left - 320, y: rect.bottom + 8 });
                  setShowConnectionAsk(true);
                }}
                title="Add connection"
              >
                <Sparkles size={14} strokeWidth={1.5} className={shared.sparkle} />
              </button>
            ) : section === "routines" ? (
              <button
                ref={routinesPlusRef}
                className={styles.searchBtn}
                onClick={() => {
                  const rect = routinesPlusRef.current?.getBoundingClientRect();
                  if (rect) setRoutinesAskPos({ x: rect.left - 320, y: rect.bottom + 8 });
                  setShowRoutinesAsk(true);
                }}
                title="Create or manage routines"
              >
                <Sparkles size={14} strokeWidth={1.5} className={shared.sparkle} />
              </button>
            ) : section === "skills" ? (
              <>
                <button
                  className={styles.searchBtn}
                  onClick={handleImportSkill}
                  title="Import skill from zip"
                >
                  <Download size={14} strokeWidth={1.5} />
                </button>
                <button
                  ref={skillsPlusRef}
                  className={styles.searchBtn}
                  onClick={() => {
                    const rect = skillsPlusRef.current?.getBoundingClientRect();
                    if (rect) setSkillsAskPos({ x: rect.left - 320, y: rect.bottom + 8 });
                    setShowSkillsAsk(true);
                  }}
                  title="Create or manage skills"
                >
                  <Sparkles size={14} strokeWidth={1.5} className={shared.sparkle} />
                </button>
              </>
            ) : section !== "settings" ? (
              <button
                className={`${styles.searchBtn} ${searching ? styles.searchBtnActive : ""}`}
                onClick={() => setSearching(true)}
                title="Search messages"
              >
                <Search size={14} strokeWidth={1.5} />
              </button>
            ) : undefined}
          >
            {contextContent}
          </ContextPanel>
        }
        details={
          <DetailsPanel
            title={detailsTitle}
            contentKey={section === "settings" ? settingsSub : section}
          >
            {detailsContent}
          </DetailsPanel>
        }
      />
      {renameChat && (
        <RenameModal
          currentName={renameChat.name}
          onRename={async (name) => {
            if (!conn) return;
            await conn.request("chat.rename", { id: renameChat.id, name });
          }}
          onClose={() => setRenameChat(null)}
        />
      )}
      {showConnectionAsk && (
        <AssistantAsk
          onSubmit={handleConnectionAsk}
          onClose={() => setShowConnectionAsk(false)}
          hint="The assistant can help you connect to external services like GitHub, Gmail, Linear, and more."
          placeholder="Connect to Gmail..."
          initialPos={connectionAskPos}
        />
      )}
      {showSkillsAsk && (
        <AssistantAsk
          onSubmit={handleSkillsAsk}
          onClose={() => setShowSkillsAsk(false)}
          hint="The assistant can create, review, and manage skills. Ask it to create a new skill or review an imported one."
          placeholder="Create a code review skill..."
          initialPos={skillsAskPos}
        />
      )}
      {showRoutinesAsk && (
        <AssistantAsk
          onSubmit={handleRoutinesAsk}
          onClose={() => setShowRoutinesAsk(false)}
          hint="The assistant will walk you through creating a routine — scheduled tasks that run automatically."
          placeholder="Summarize unread emails every morning..."
          initialPos={routinesAskPos}
        />
      )}
    </>
  );
}
