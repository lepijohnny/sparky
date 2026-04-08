import { Download, Search, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./App.module.css";
import shared from "./styles/shared.module.css";
import RenameModal from "./components/modals/RenameModal";
import AssistantAsk from "./components/shared/AssistantAsk";
import ConnectionError from "./components/shared/ConnectionError";
import SplashScreen from "./components/shared/SplashScreen";
import OnboardingPage from "./pages/onboarding/OnboardingPage";

import { useConnection } from "./context/ConnectionContext";
import { useAppNavigation } from "./hooks/useAppNavigation";
import { useStore } from "./store";
import { useToasts } from "./context/ToastContext";
import { useAppSubscriptions } from "./hooks/useAppSubscriptions";
import { useSystemAsk } from "./hooks/useSystemAsk";
import { useContentRouter, SECTION_LABELS } from "./components/ContentRouter";

import Layout from "./layouts/Layout";
import SourceAddButton from "./components/knowledge/SourceAddButton";
import ContextPanel from "./panels/ContextPanel";
import DetailsPanel from "./panels/DetailsPanel";
import MenuPanel from "./panels/MenuPanel";
import type { Chat } from "./types/chat";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { setMarkReadCallback } from "./store/selection";

export default function App() {
  const { conn, wsStatus, wsPort, openLogs } = useConnection();

  const selectChat = useStore((s) => s.selectChat);
  const selectedChat = useStore((s) => s.anchorChat);
  const renameChat = useStore((s) => s.renameChat);
  const setRenameChat = useStore((s) => s.setRenameChat);
  const labels = useStore((s) => s.labels);
  const llmConnections = useStore((s) => s.llmConnections);
  const booted = useStore((s) => s.booted);

  const router = useAppNavigation();
  const { section, searching, setSearching } = router;
  const { addToast } = useToasts();

  const [debugUnlocked, setDebugUnlocked] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [connTimeout, setConnTimeout] = useState(false);

  useEffect(() => {
    if (wsStatus === "connected") { setConnTimeout(false); return; }
    const t = setTimeout(() => setConnTimeout(true), 15000);
    return () => clearTimeout(t);
  }, [wsStatus]);

  useEffect(() => {
    if (!conn) return;
    setMarkReadCallback((chatId) => conn.request("chat.unread", { id: chatId, unread: false }));
    return () => setMarkReadCallback(() => {});
  }, [conn]);

  useAppSubscriptions(conn, addToast, router);

  const handleConnectionAsk = useSystemAsk(conn, "connection", section, selectChat, router.handleSectionChange);
  const handleSkillsAsk = useSystemAsk(conn, "skills", section, selectChat, router.handleSectionChange);
  const handleRoutinesAsk = useSystemAsk(conn, "routines", section, selectChat, router.handleSectionChange);

  // ── Ask popover state ──

  const [showConnectionAsk, setShowConnectionAsk] = useState(false);
  const [connectionAskPos, setConnectionAskPos] = useState({ x: 0, y: 0 });
  const connectionPlusRef = useRef<HTMLButtonElement>(null);

  const [showSkillsAsk, setShowSkillsAsk] = useState(false);
  const [skillsAskPos, setSkillsAskPos] = useState({ x: 0, y: 0 });
  const skillsPlusRef = useRef<HTMLButtonElement>(null);

  const [showRoutinesAsk, setShowRoutinesAsk] = useState(false);
  const [routinesAskPos, setRoutinesAskPos] = useState({ x: 0, y: 0 });
  const routinesPlusRef = useRef<HTMLButtonElement>(null);

  // ── Source handlers ──

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

  const handleUrlSubmit = useCallback(async (url: string) => {
    setShowUrlInput(false);
    if (!conn) return;
    try {
      await conn.request("kt.sources.add.url", { url });
    } catch (err: any) {
      addToast({ id: `kt-err-${Date.now()}`, kind: "error", title: err?.message ?? String(err) });
    }
  }, [conn, addToast]);

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

  // ── Chat handlers ──

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

  const handleRename = useCallback((c: Chat) => setRenameChat(c), [setRenameChat]);
  const handleDelete = useCallback(() => selectChat(null), [selectChat]);

  // ── Keyboard shortcuts ──

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

  const { contextContent, detailsTitle, detailsContent } = useContentRouter({
    conn,
    router,
    debugUnlocked,
    showUrlInput,
    onUrlSubmit: handleUrlSubmit,
    onUrlCancel: () => setShowUrlInput(false),
    onRename: handleRename,
    onDelete: handleDelete,
  });

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
            selectedLabel={router.selectedLabel}
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
            contentKey={section === "chats" || section === "flagged" || section === "labels" || section === "archived" ? "chats" : section}
            action={section === "sources" ? (
              <SourceAddButton onFile={handleAddFile} onFolder={handleAddFolder} onUrl={() => setShowUrlInput(true)} />
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
            contentKey={section === "settings" ? router.settingsSub : section === "chats" || section === "flagged" || section === "labels" || section === "archived" ? "chats" : section}
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
