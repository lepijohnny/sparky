import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { PrintContext } from "../../context/PrintContext";
import { Eye, EyeClosed, EyeOff, Printer } from "lucide-react";
import ErrorBoundary from "../../components/shared/ErrorBoundary";
import { useConnection } from "../../context/ConnectionContext";
import { useDragRegion } from "../../hooks/useDragRegion";
import { useWsRequest } from "../../hooks/useWsRequest";
import { collapseEntries, type Message } from "../../lib/chatUtils";
import { tokenize, type BlockRenderer } from "../../lib/markdownLexer";
import { codeRenderer } from "../../lib/renderers/codeRenderer";
import { createMarkdownRenderer } from "../../lib/renderers/markdownRenderer";
import { mermaidRenderer } from "../../lib/renderers/mermaidRenderer";
import { latexRenderer } from "../../lib/renderers/latexRenderer";
import { tableRenderer } from "../../lib/renderers/tableRenderer";
import { chartRenderer } from "../../lib/renderers/chartRenderer";
import { htmlRenderer } from "../../lib/renderers/htmlRenderer";
import type { Chat, ChatEntry } from "../../types/chat";
import styles from "./PrintDetailsPage.module.css";

interface AssistantBlocksProps {
  message: Message;
  hiddenKeys: Set<string>;
  onToggleBlock: (key: string) => void;
}

const AssistantBlocks = memo(function AssistantBlocks({ message, hiddenKeys, onToggleBlock }: AssistantBlocksProps) {
  const rendererMap = useMemo(() => {
    const md = createMarkdownRenderer();
    const map = new Map<string, BlockRenderer>();
    map.set("markdown", md);
    map.set("code", codeRenderer);
    map.set("mermaid", mermaidRenderer);
    map.set("latex", latexRenderer);
    map.set("table", tableRenderer);
    map.set("chart", chartRenderer);
    map.set("echart", chartRenderer);
    map.set("html", htmlRenderer);
    return map;
  }, []);

  const blocks = useMemo(() => tokenize(message.content), [message.content]);
  const md = rendererMap.get("markdown")!;

  return (
    <>
      {blocks.map((block, i) => {
        const key = `${message.id}-${block.type}-${i}`;
        const hidden = hiddenKeys.has(key);
        const renderer = rendererMap.get(block.type) ?? md;
        return (
          <div key={key} className={`${styles.bubble} ${styles.bubbleAssistant} ${hidden ? styles.hidden : ""}`}>
            <ErrorBoundary fallback={<div className={styles.error}>Failed to render block</div>}>
              <div className={styles.blockContent}>
                {renderer.render(block.content, key)}
              </div>
            </ErrorBoundary>
            <div className={styles.overlay}>
              <span className={styles.overlayBtn} onClick={() => onToggleBlock(key)}>
                {hidden ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
              </span>
            </div>
          </div>
        );
      })}
    </>
  );
});

const UserBubble = memo(function UserBubble({ message, hidden, onToggleHidden }: { message: Message; hidden?: boolean; onToggleHidden?: () => void }) {
  return (
    <div className={`${styles.bubble} ${styles.bubbleUser} ${hidden ? styles.hidden : ""}`}>
      <div className={styles.bubbleContent}>{message.content}</div>
      {onToggleHidden && (
        <div className={styles.overlay}>
          <span className={styles.overlayBtn} onClick={onToggleHidden}>
            {hidden ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
          </span>
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
    conn, "chat.entries", { chatId: chat.id }, [chat.id],
  );

  useEffect(() => {
    if (data?.entries) setEntries(data.entries);
  }, [data]);

  const messages = collapseEntries(entries);

  const toggleHidden = useCallback((key: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const handlePrint = useCallback(async () => {
    const originalTitle = document.title;
    document.title = chat.name || "Sparky Chat";

    const root = document.documentElement;
    const saved = new Map<string, string>();
    const printVars: Record<string, string> = {
      "--bg": "#ffffff", "--fg": "#1a1a1a", "--bg-raised": "#f5f5f5",
      "--bg-surface": "#f0f0f0", "--bg-overlay": "#f0f0f0", "--bg-hover": "transparent",
      "--border": "#d0d0d0", "--fg-muted": "#666666", "--fg-subtle": "#999999",
      "--accent": "#4078f2", "--accent-soft": "rgba(64,120,242,0.1)",
      "--shadow": "none", "--code-bg": "#f5f5f5", "--code-fg": "#1a1a1a",
    };
    for (const [k, v] of Object.entries(printVars)) {
      saved.set(k, root.style.getPropertyValue(k));
      root.style.setProperty(k, v);
    }

    const restore = () => {
      document.title = originalTitle;
      for (const [k, v] of saved) {
        if (v) root.style.setProperty(k, v); else root.style.removeProperty(k);
      }
    };
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
        <button className={styles.toolbarBtn} onClick={() => {
          const allKeys: string[] = [];
          for (const m of messages) {
            if (m.role === "user") { allKeys.push(m.id); }
            else { tokenize(m.content).forEach((b, i) => allKeys.push(`${m.id}-${b.type}-${i}`)); }
          }
          setHiddenIds(new Set(allKeys));
        }} title="Hide all">
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
            <AssistantBlocks
              key={msg.id}
              message={msg}
              hiddenKeys={hiddenIds}
              onToggleBlock={toggleHidden}
            />
          )
        )}
      </div>
    </div>
    </PrintContext.Provider>
  );
}
