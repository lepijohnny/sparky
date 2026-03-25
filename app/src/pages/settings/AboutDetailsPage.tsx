import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { useStore } from "../../store";
import shared from "../../styles/shared.module.css";
import styles from "./AboutDetailsPage.module.css";

const VERSION = __APP_VERSION__;

const LINKS = [
  { label: "Website", url: "https://getsparky.chat" },
  { label: "GitHub", url: "https://github.com/lepijohnny/sparky" },
  { label: "Documentation", url: "https://getsparky.chat/docs/getting-started/introduction" },
];

export default function AboutDetailsPage() {
  const update = useStore((s) => s.updater);
  const checkForUpdates = useStore((s) => s.checkForUpdates);
  const downloadAndInstall = useStore((s) => s.downloadAndInstall);
  const restart = useStore((s) => s.restartApp);

  useEffect(() => {
    if (update.status === "idle") checkForUpdates();
  }, []);

  return (
    <div className={shared.contentArea}>
      <div className={styles.hero}>
        <img src="/icons/app-icon-128.png" alt="Sparky" className={styles.logo} />
        <div className={styles.heroText}>
          <h1 className={styles.appName}>Sparky</h1>
          <p className={styles.version}>Version {VERSION}</p>
        </div>
      </div>

      {update.notes && update.notes.length > 0 && (
        <div className={shared.card}>
          <div className={shared.cardHeader}>What's New in {update.version}</div>
          <div className={shared.cardBody}>
            <ul className={styles.changelog}>
              {update.notes.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
