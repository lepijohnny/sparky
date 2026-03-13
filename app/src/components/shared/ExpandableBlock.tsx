import { Maximize2 } from "lucide-react";
import { memo, type ReactNode, useCallback } from "react";
import styles from "./ExpandableBlock.module.css";

const TITLES: Record<string, string> = {
  mermaid: "Mermaid",
  table: "Table",
  latex: "LaTeX",
  chart: "Chart",
};

async function openExpandWindow(type: string, content: string) {
  if (!window.__TAURI_INTERNALS__) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const key = `expand-${Date.now()}`;
    localStorage.setItem(key, JSON.stringify({ type, content }));
    const webview = new WebviewWindow(`expand-${Date.now()}`, {
      url: `/?expand=${key}`,
      title: TITLES[type] ?? type,
      width: 1000,
      height: 800,
      center: true,
      resizable: true,
      decorations: true,
      titleBarStyle: "overlay",
      hiddenTitle: true,
    });
    webview.once("tauri://error", (e) => {
      console.error("Expand window error:", e);
      localStorage.removeItem(key);
    });
  } catch (err) {
    console.error("openExpandWindow failed:", err);
  }
}

interface ExpandableBlockProps {
  type: string;
  content: string;
  children: ReactNode;
}

export default memo(function ExpandableBlock({ type, content, children }: ExpandableBlockProps) {
  const handleExpand = useCallback(() => {
    openExpandWindow(type, content);
  }, [type, content]);

  return (
    <div className={styles.wrap}>
      {children}
      <button className={styles.expandBtn} onClick={handleExpand} title="Expand">
        <Maximize2 size={14} strokeWidth={1.5} />
      </button>
    </div>
  );
});
