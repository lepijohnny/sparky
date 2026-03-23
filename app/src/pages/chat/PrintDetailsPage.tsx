import { memo, useCallback, useEffect, useState, type ReactNode } from "react";
import { PrintContext } from "../../context/PrintContext";
import { Eye, EyeClosed, EyeOff, Printer } from "lucide-react";
import AgentMessageBubble from "../../components/chat/AgentMessageBubble";
import ErrorBoundary from "../../components/shared/ErrorBoundary";
import { useConnection } from "../../context/ConnectionContext";
import { useDragRegion } from "../../hooks/useDragRegion";
import { useWsRequest } from "../../hooks/useWsRequest";
import { collapseEntries, type Message } from "../../lib/chatUtils";
import type { Chat, ChatEntry } from "../../types/chat";
import styles from "./PrintDetailsPage.module.css";

const UserBubble = memo(function UserBubble({ message, hidden, onToggleHidden }: { message: Message; hidden?: boolean; onToggleHidden?: () => void }) {
  return (
    <div className={`${styles.bubble} ${styles.bubbleUser} ${hidden ? styles.hidden : ""}`}>
      <div className={styles.bubbleContent}>{message.content}</div>
      {onToggleHidden && (
        <div className={styles.overlay} onClick={onToggleHidden}>
          {hidden ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
        </div>
      )}
    </div>
  );
});

interface PrintDetailsPageProps {
  chat: Chat;
}

export default function PrintDetailsPage({ chat }: PrintDetailsPageProps) {
  const { conn } = useConnection();
  const dragRegion = useDragRegion();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const { data } = useWsRequest<{ entries: ChatEntry[] }>(
    conn, "chat.get.id", { id: chat.id }, [chat.id],
  );

  useEffect(() => {
    if (data?.entries) setEntries(data.entries);
  }, [data]);

  const messages = collapseEntries(entries);

  const toggleHidden = useCallback((id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handlePrint = useCallback(async () => {
    const originalTitle = document.title;
    document.title = chat.name || "Sparky Chat";
    const restore = () => { document.title = originalTitle; };
    window.addEventListener("afterprint", restore, { once: true });
    try {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      await getCurrentWebview().print();
    } catch {
      window.print();
    }
  }, [chat.name]);

  return (
    <PrintContext.Provider value={true}>
    <div className={styles.page}>
      <div className={styles.toolbar} {...dragRegion}>
        <button className={styles.toolbarBtn} onClick={() => setHiddenIds(new Set(messages.map((m) => m.id)))} title="Hide all">
          <EyeClosed size={16} strokeWidth={1.5} />
        </button>
        <button className={styles.toolbarBtn} onClick={() => setHiddenIds(new Set())} title="Show all">
          <Eye size={16} strokeWidth={1.5} />
        </button>
        <button className={styles.toolbarBtn} onClick={handlePrint} title="Print">
          <Printer size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className={styles.content}>
        {chat.name && <h1 className={styles.title}>{chat.name}</h1>}
        {messages.map((msg) =>
          msg.role === "user" ? (
            <UserBubble
              key={msg.id}
              message={msg}
              hidden={hiddenIds.has(msg.id)}
              onToggleHidden={() => toggleHidden(msg.id)}
            />
          ) : (
            <div
              key={msg.id}
              className={`${styles.bubble} ${styles.bubbleAssistant} ${hiddenIds.has(msg.id) ? styles.hidden : ""}`}
            >
              <ErrorBoundary fallback={<div className={styles.error}>Failed to render message</div>}>
                <AgentMessageBubble message={msg} role={chat.role} />
              </ErrorBoundary>
              <div className={styles.overlay} onClick={() => toggleHidden(msg.id)}>
                {hiddenIds.has(msg.id) ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
              </div>
            </div>
          )
        )}
      </div>
    </div>
    </PrintContext.Provider>
  );
}
