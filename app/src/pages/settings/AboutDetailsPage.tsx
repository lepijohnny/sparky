import { ExternalLink } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import shared from "../../styles/shared.module.css";
import styles from "./AboutDetailsPage.module.css";

const VERSION = __APP_VERSION__;

const LINKS = [
  { label: "Website", url: "https://getsparky.chat" },
  { label: "GitHub", url: "https://github.com/nicoradin/sparky" },
  { label: "Documentation", url: "https://getsparky.chat/docs/getting-started/introduction" },
];

const CHANGELOG: string[] = [
  "Unified Sparky role for all chats (merged assistant and regular)",
  "Service connections via @mention (GitHub, Gmail, Todoist, Telegram)",
  "MCP protocol support with auto-discovery",
  "Google Gemini via OAuth PKCE (Cloud Code Assist)",
  "Streaming ticker for tool call responses",
  "Onboarding wizard for first launch",
  "Print chat to PDF with title and per-message visibility",
  "Windows support (DPAPI keychain, fnm node)",
  "Local RAG with hybrid search (BM25 + semantic)",
  "Extractor plugins (Mozilla Readability, markdown output)",
  "Rolling summary at 80% context window",
  "Anchors and labels for chat organization",
  "Focus mode (⌘B) for distraction-free writing",
  "Downloadable code blocks (PNG, CSV)",
  "ECharts for data visualization (radar, pie, bar, line)",
  "Mermaid diagram rendering",
  "LaTeX math rendering",
  "Themed log viewer with auto-pruning",
  "Tool approval system with configurable rules",
  "DDG Lite fallback for web search",
];

interface UpdateState {
  status: "idle" | "checking" | "available" | "downloading" | "ready" | "error" | "unavailable";
  version?: string;
  progress?: number;
  error?: string;
}

export default function AboutDetailsPage() {
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  const checkForUpdates = useCallback(async () => {
    if (!window.__TAURI_INTERNALS__) {
      setUpdate({ status: "idle" });
      return;
    }
    setUpdate({ status: "checking" });
    const start = Date.now();
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const result = await check();
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
      if (!result) {
        setUpdate({ status: "idle" });
        return;
      }
      setUpdate({ status: "available", version: result.version });
    } catch {
      const elapsed = Date.now() - start;
      if (elapsed < 600) await new Promise((r) => setTimeout(r, 600 - elapsed));
      setUpdate({ status: "unavailable" });
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    setUpdate((prev) => ({ ...prev, status: "downloading", progress: 0 }));
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const result = await check();
      if (!result) return;

      let total = 0;
      let downloaded = 0;
      await result.downloadAndInstall((event: any) => {
        if (event.event === "Started" && event.data.contentLength) {
          total = event.data.contentLength;
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          if (total > 0) setUpdate((prev) => ({ ...prev, progress: Math.round((downloaded / total) * 100) }));
        } else if (event.event === "Finished") {
          setUpdate((prev) => ({ ...prev, status: "ready" }));
        }
      });
    } catch (err) {
      setUpdate({ status: "error", error: String(err) });
    }
  }, []);

  const restart = useCallback(async () => {
    try {
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch {}
  }, []);

  useEffect(() => {
    checkForUpdates();
  }, [checkForUpdates]);

  return (
    <div className={shared.contentArea}>
      <div className={styles.hero}>
        <img src="/icons/app-icon-128.png" alt="Sparky" className={styles.logo} />
        <div className={styles.heroText}>
          <h1 className={styles.appName}>Sparky</h1>
          <p className={styles.version}>Version {VERSION}</p>
        </div>
      </div>

      <div className={shared.card}>
        <div className={shared.cardHeader}>What's New in {VERSION}</div>
        <div className={shared.cardBody}>
          <ul className={styles.changelog}>
            {CHANGELOG.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className={shared.card}>
        <div className={shared.cardHeader}>Update</div>
        <div className={`${shared.cardBody} ${styles.updateBody}`}>
          {update.status === "idle" && (
            <div className={styles.updateAvailable}>
              <p className={styles.updateStatus}>✓ You're on the latest version</p>
              <button className={styles.checkBtn} onClick={checkForUpdates}>Check for updates</button>
            </div>
          )}
          {update.status === "checking" && (
            <div className={styles.updateAvailable}>
              <p className={styles.updateStatus}>Checking…</p>
              <button className={styles.checkBtn} disabled>Checking</button>
            </div>
          )}
          {update.status === "unavailable" && (
            <div className={styles.updateAvailable}>
              <p className={styles.updateStatus}>Update check unavailable</p>
              <button className={styles.checkBtn} onClick={checkForUpdates}>Retry</button>
            </div>
          )}
          {update.status === "available" && (
            <div className={styles.updateAvailable}>
              <p className={styles.updateStatus}>Version {update.version} is available</p>
              <button className={styles.updateBtn} onClick={downloadAndInstall}>Download and install</button>
            </div>
          )}
          {update.status === "downloading" && (
            <div className={styles.updateDownloading}>
              <p className={styles.updateStatus}>Downloading…</p>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${update.progress ?? 0}%` }} />
              </div>
              <span className={styles.progressLabel}>{update.progress ?? 0}%</span>
            </div>
          )}
          {update.status === "ready" && (
            <div className={styles.updateAvailable}>
              <p className={styles.updateStatus}>Update ready. Restart to apply.</p>
              <button className={styles.updateBtn} onClick={restart}>Restart now</button>
            </div>
          )}
          {update.status === "error" && (
            <div className={styles.updateError}>
              <p>Update failed: {update.error}</p>
              <button className={styles.updateBtn} onClick={checkForUpdates}>Retry</button>
            </div>
          )}
        </div>
      </div>

      <div className={shared.card}>
        <div className={shared.cardHeader}>Links</div>
        <div className={shared.cardBody}>
          <div className={styles.links}>
            {LINKS.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className={styles.link}>
                {link.label}
                <ExternalLink size={12} strokeWidth={1.5} />
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
