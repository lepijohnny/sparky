import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle } from "lucide-react";
import { useCallback } from "react";
import { useConnection } from "../../context/ConnectionContext";
import styles from "./ConnectionError.module.css";

export default function ConnectionError() {
  const { reconnect, openLogs } = useConnection();

  const handleRetry = useCallback(async () => {
    try {
      await invoke("start_sidecar");
    } catch { /* may already be running */ }
    reconnect();
  }, [reconnect]);

  const handleQuit = useCallback(() => {
    invoke("quit_app");
  }, []);

  return (
    <div className={styles.overlay}>
      <div className={styles.content}>
        <AlertTriangle size={48} className={styles.icon} />
        <div className={styles.title}>Sparky couldn't start</div>
        <div className={styles.message}>
          The background service failed to connect. This usually means the sidecar process didn't start correctly.
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.retryBtn} onClick={handleRetry}>Retry</button>
          <button type="button" className={styles.logsBtn} onClick={openLogs}>View Logs</button>
          <button type="button" className={styles.quitBtn} onClick={handleQuit}>Quit</button>
        </div>
      </div>
    </div>
  );
}
