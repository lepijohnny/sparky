import { ChevronDown } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import RenameModal from "../../components/modals/RenameModal";
import ContextMenu from "../../components/shared/ContextMenu";
import { Ctx as ConnectionCtx, useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import { syncPopup } from "../../store/sync";
import { useWsSubscriber } from "../../hooks/useWsSubscriber";
import { buildChatActions } from "../../lib/chatActions";
import { type WsConnection, wsFactory } from "../../lib/ws";
import type { Chat } from "../../types/chat";
import ChatDetailsPage from "./ChatDetailsPage";
import styles from "./ChatWindow.module.css";

interface ChatWindowProps {
  chatId: string;
  port: number;
  token: string;
  printMode?: boolean;
}

/**
 * Standalone chat window — renders a single chat without sidebar/menu.
 * Provides its own ConnectionContext from URL params.
 */
export default function ChatWindow({ chatId, port, token, printMode }: ChatWindowProps) {
  const [conn, setConn] = useState<WsConnection | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Connect to WS
  useEffect(() => {
    let cancelled = false;
    let ws: WsConnection | null = null;
    (async () => {
      try {
        ws = await wsFactory.create(port, token);
        if (cancelled) { wsFactory.destroy(ws); return; }
        syncPopup(ws);
        setConn(ws);
      } catch (err) {
        if (!cancelled) setError(`Failed to connect: ${err}`);
      }
    })();
    return () => {
      cancelled = true;
      if (ws) wsFactory.destroy(ws);
    };
  }, [port, token]);

  if (error) {
    return (
      <div className={styles.centered}>
        <span className={styles.error}>{error}</span>
      </div>
    );
  }

  if (!conn) {
    return (
      <div className={styles.centered}>
        <span className={styles.message}>Connecting…</span>
      </div>
    );
  }

  return (
    <ConnectionCtx.Provider value={{
      conn,
      wsStatus: "connected",
      wsPort: port,
      sidecarToken: token,
      openLogs: () => {},
    }}>
      <ChatWindowInner chatId={chatId} printMode={printMode} />
    </ConnectionCtx.Provider>
  );
}

/** Inner component — has access to all contexts, handles chat loading + subscriptions */
function ChatWindowInner({ chatId, printMode }: { chatId: string; printMode?: boolean }) {
  const { conn, wsPort, sidecarToken } = useConnection();
  const labels = useStore((s) => s.labels);
  const [chat, setChat] = useState<Chat | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [renameChat, setRenameChat] = useState<Chat | null>(null);

  // Load chat
  useEffect(() => {
    if (!conn) return;
    (async () => {
      try {
        const result = await conn.request<{ chat: Chat }>("chat.get.id", { id: chatId });
        if (result?.chat) {
          setChat(result.chat);
        }
      } catch (err) {
        console.error("Failed to load chat:", err);
      }
    })();
  }, [conn, chatId]);

  // Keep chat in sync with backend mutations (model change, rename, etc.)
  useWsSubscriber<{ chat: Chat }>(conn, "chat.updated", useCallback((data) => {
    if (data.chat.id === chatId) {
      setChat(data.chat);
      if (data.chat.name) document.title = data.chat.name;
    }
  }, [chatId]));

  // Handle deletion
  useWsSubscriber<{ id: string }>(conn, "chat.deleted", useCallback((data) => {
    if (data.id === chatId) setDeleted(true);
  }, [chatId]));

  // Set window title
  useEffect(() => {
    if (chat?.name) document.title = chat.name;
  }, [chat?.name]);

  const actions = useMemo(() => chat ? buildChatActions({
    conn,
    chat,
    labels,
    wsPort,
    sidecarToken,
    onRename: (c) => setRenameChat(c),
  }) : [], [conn, chat, labels, wsPort, sidecarToken]);

  if (deleted) {
    return (
      <div className={styles.centered}>
        <span className={styles.message}>This chat has been deleted.</span>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className={styles.centered}>
        <span className={styles.message}>Loading…</span>
      </div>
    );
  }

  return (
    <div className={styles.window}>
      <div className={styles.header} data-tauri-drag-region>
        <ContextMenu actions={actions} align="left">
          <span className={styles.title}>
            {chat.name}
            <ChevronDown size={14} strokeWidth={1.5} style={{ color: "var(--fg-muted)" }} />
          </span>
        </ContextMenu>
      </div>
      <div className={styles.content}>
        <ChatDetailsPage chat={chat} printMode={printMode} />
      </div>
      {renameChat && (
        <RenameModal
          currentName={renameChat.name}
          onRename={async (name) => {
            await conn?.request("chat.rename", { id: renameChat.id, name });
          }}
          onClose={() => setRenameChat(null)}
        />
      )}
    </div>
  );
}
