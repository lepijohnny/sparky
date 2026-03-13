import type { ReactNode } from "react";
import styles from "./ContextPanel.module.css";

interface ContextPanelProps {
  title: string;
  contentKey?: string;
  action?: ReactNode;
  children: ReactNode;
}

export default function ContextPanel({ title, contentKey, action, children }: ContextPanelProps) {
  return (
    <div className={styles.column}>
      <div className={styles.header} data-tauri-drag-region>
        <span className={styles.title}>{title}</span>
        {action && <div className={styles.action} onMouseDown={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div key={contentKey} className={styles.fadeContent}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
