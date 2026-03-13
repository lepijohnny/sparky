import type { ReactNode } from "react";
import ErrorBoundary from "../components/shared/ErrorBoundary";
import styles from "./DetailsPanel.module.css";

interface DetailsPanelProps {
  title: ReactNode;
  contentKey?: string;
  children: ReactNode;
}

export default function DetailsPanel({ title, contentKey, children }: DetailsPanelProps) {
  return (
    <div className={styles.column}>
      <div className={styles.header} data-tauri-drag-region>
        <div className={styles.titleWrap}>{title}</div>
      </div>
      <div className={styles.wrap}>
        <div className={styles.card}>
          <ErrorBoundary fallback={<div className={styles.error}>Something went wrong.</div>}>
            <div key={contentKey} className={styles.fadeContent}>
              {children}
            </div>
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
