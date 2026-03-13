import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import styles from "./WindowControls.module.css";

/**
 * Custom window controls (minimize / maximize-restore / close) for Windows.
 * Hidden by default, appears on mouse hover near the top-right of the window.
 * Only renders on Windows (detected via navigator.userAgent).
 */
export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const minimize = useCallback(() => getCurrentWindow().minimize(), []);
  const toggleMaximize = useCallback(() => getCurrentWindow().toggleMaximize(), []);
  const close = useCallback(() => getCurrentWindow().close(), []);

  if (!navigator.userAgent.includes("Windows")) return null;

  return (
    <>
      <div className={styles.hoverZone} />
      <div className={styles.controls}>
        <button className={styles.btn} onClick={minimize} aria-label="Minimize">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2"><line x1="1" y1="6" x2="11" y2="6" /></svg>
        </button>
        <button className={styles.btn} onClick={toggleMaximize} aria-label={maximized ? "Restore" : "Maximize"}>
          {maximized ? (
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1" y="3" width="8" height="8" />
              <polyline points="3,3 3,1 11,1 11,9 9,9" fill="none" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1.5" y="1.5" width="9" height="9" />
            </svg>
          )}
        </button>
        <button className={`${styles.btn} ${styles.closeBtn}`} onClick={close} aria-label="Close">
          <svg viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.2">
            <line x1="0" y1="0" x2="10" y2="10" />
            <line x1="10" y1="0" x2="0" y2="10" />
          </svg>
        </button>
      </div>
    </>
  );
}
