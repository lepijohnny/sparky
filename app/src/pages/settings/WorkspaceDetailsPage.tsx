import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Brain, HardDrive, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import ModelDownloadModal from "../../components/modals/ModelDownloadModal";
import RenameWorkspaceModal from "../../components/modals/RenameWorkspaceModal";
import { useConnection } from "../../context/ConnectionContext";
import { useToasts } from "../../context/ToastContext";
import { useStore } from "../../store";
import type { WorkspaceSpace } from "../../types/workspace";
import shared from "../../styles/shared.module.css";
import styles from "./WorkspaceDetailsPage.module.css";

interface DownloadState {
  active: boolean;
  progress: number;
  label: string;
  completedMode: "hybrid" | null;
}

const downloadState: DownloadState = { active: false, progress: 0, label: "", completedMode: null };
const downloadListeners = new Set<() => void>();

function setDownloadState(updates: Partial<DownloadState>) {
  Object.assign(downloadState, updates);
  for (const cb of downloadListeners) cb();
}

function useDownloadState(): DownloadState {
  const [, rerender] = useState(0);
  useEffect(() => {
    const cb = () => rerender((n) => n + 1);
    downloadListeners.add(cb);
    return () => { downloadListeners.delete(cb); };
  }, []);
  return downloadState;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function WorkspaceDetailsPage() {
  const { conn } = useConnection();
  const { addToast } = useToasts();
  const workspace = useStore((s) => s.workspace);
  const workspaceSpace = useStore((s) => s.workspaceSpace);
  const setWorkspaceSpace = useStore((s) => s.setWorkspaceSpace);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [localKnowledgeSearch, setLocalKnowledgeSearch] = useState<"keyword" | "hybrid" | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [missingModels, setMissingModels] = useState<{ name: string; filename: string; size_bytes: number }[]>([]);
  const dl = useDownloadState();

  const knowledgeSearch = localKnowledgeSearch ?? dl.completedMode ?? workspace?.knowledgeSearch ?? "keyword";

  const connRef = useRef(conn);
  const workspaceRef = useRef(workspace);
  connRef.current = conn;
  workspaceRef.current = workspace;

  useEffect(() => {
    if (!conn) return;
    conn.request<WorkspaceSpace>("settings.workspace.space").then(setWorkspaceSpace).catch(() => {});
  }, [conn, workspace?.id]);

  const switchToMode = useCallback(async (mode: "keyword" | "hybrid", opts?: { notify?: boolean; message?: string; expire?: boolean }) => {
    const c = connRef.current;
    const w = workspaceRef.current;
    if (!c || !w) return;
    setLocalKnowledgeSearch(mode);
    setDownloadState({ ...downloadState, completedMode: null });
    try {
      await c.request("settings.workspace.update", {
        id: w.id,
        knowledgeSearch: mode,
      }, opts);
    } catch {
      setLocalKnowledgeSearch(null);
    }
  }, []);

  const handleKnowledgeSearch = useCallback(async (mode: "keyword" | "hybrid") => {
    if (!conn || !workspace || knowledgeSearch === mode) return;

    if (mode === "hybrid") {
      try {
        const models = await invoke<{ name: string; present: boolean }[]>("check_models");
        const missing = models.filter((m) => !m.present);
        if (missing.length > 0) {
          setMissingModels(missing);
          setShowDownloadModal(true);
          return;
        }
      } catch {
        return;
      }
    }

    switchToMode(mode);
  }, [conn, workspace, knowledgeSearch, switchToMode]);

  const startDownload = useCallback(async () => {
    setShowDownloadModal(false);
    setDownloadState({ active: true, progress: 0, label: "Starting download…" });

    try {
      const models = await invoke<{ name: string; filename: string; present: boolean; size_bytes: number }[]>("check_models");
      const missing = models.filter((m) => !m.present);
      const totalSize = missing.reduce((sum, m) => sum + m.size_bytes, 0);

      const unlistenProgress = await listen<{ filename: string; downloaded: number; total: number }>("models:progress", (e) => {
        const p = e.payload;
        const current = missing.find((m) => m.filename === p.filename);
        setDownloadState({
          label: current ? `Downloading ${current.filename}…` : "Downloading…",
          progress: (() => {
            let done = 0;
            for (const m of missing) {
              if (m.filename === p.filename) done += p.downloaded;
              else if (m.filename < p.filename) done += m.size_bytes;
            }
            return totalSize > 0 ? (done / totalSize) * 100 : 0;
          })(),
        });
      });

      const unlistenComplete = await listen("models:complete", () => {
        setDownloadState({ active: false, progress: 100, label: "", completedMode: "hybrid" });
        switchToMode("hybrid", { notify: true, message: "Download complete. Hybrid search is now active.", expire: false });
        unlistenProgress();
        unlistenComplete();
      });

      invoke("download_models", { filenames: missing.map((m) => m.filename) }).catch((err: any) => {
        setDownloadState({ active: false, progress: 0, label: "", completedMode: null });
        switchToMode("keyword");
        addToast({ id: `dl_err_${Date.now()}`, kind: "error", title: "Model download failed", message: err?.message ?? String(err) });
        unlistenProgress();
        unlistenComplete();
      });
    } catch (err: any) {
      setDownloadState({ active: false, progress: 0, label: "", completedMode: null });
      switchToMode("keyword");
      addToast({ id: `dl_err_${Date.now()}`, kind: "error", title: "Model download failed", message: err?.message ?? String(err) });
    }
  }, [switchToMode, addToast]);

  const handleRename = useCallback(async (name: string) => {
    if (!conn || !workspace) return;
    setShowRenameModal(false);
    try {
      await conn.request("settings.workspace.update", { id: workspace.id, name });
    } catch {}
  }, [conn, workspace]);

  const handleDownloadCancel = useCallback(() => {
    setShowDownloadModal(false);
  }, []);

  if (!workspace) {
    return (
      <div className={shared.contentArea}>
        <div className={shared.emptyState}>No active workspace</div>
      </div>
    );
  }

  return (
    <div className={shared.contentArea}>
      {/* Workspace Info */}
      <div className={shared.card}>
        <div className={shared.cardHeader}>Workspace</div>
        <div className={shared.cardBody}>
          <div className={styles.infoRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Name</label>
              <p className={styles.nameValue}>{workspace.name}</p>
            </div>
            <button className={shared.btn} onClick={() => setShowRenameModal(true)}>Rename</button>
          </div>
        </div>
      </div>

      {/* Knowledge Search */}
      <div className={shared.card}>
        <div className={shared.cardHeader}>Knowledge</div>
        <div className={shared.cardBody}>
          <div className={shared.cardBodyRow}>
            <div className={shared.fieldText}>
              <label className={shared.fieldLabel}>Search mode</label>
              <p className={shared.fieldHint}>
                How knowledge sources are searched when building chat context.
              </p>
            </div>
          </div>
          <div className={styles.searchModes}>
            <div
              className={`${styles.searchMode} ${knowledgeSearch === "keyword" ? styles.searchModeActive : ""}`}
              onClick={() => handleKnowledgeSearch("keyword")}
            >
              <div className={`${styles.imageRadio} ${knowledgeSearch === "keyword" ? styles.imageRadioActive : ""}`} />
              <div className={styles.searchModeInfo}>
                <div className={styles.searchModeName}>
                  <Search size={14} strokeWidth={1.5} />
                  Keyword
                </div>
                <div className={styles.searchModeDesc}>
                  BM25 full-text search. Fast, reliable, no model download.
                </div>
              </div>
            </div>
            <div
              className={`${styles.searchMode} ${knowledgeSearch === "hybrid" ? styles.searchModeActive : ""}`}
              onClick={() => handleKnowledgeSearch("hybrid")}
            >
              <div className={`${styles.imageRadio} ${knowledgeSearch === "hybrid" ? styles.imageRadioActive : ""}`} />
              <div className={styles.searchModeInfo}>
                <div className={styles.searchModeName}>
                  <Brain size={14} strokeWidth={1.5} />
                  Keyword + Semantic
                </div>
                {dl.active ? (
                  <div className={shared.progressWrap}>
                    <div className={shared.progressLabel}>{dl.label} {Math.round(dl.progress)}%</div>
                    <div className={shared.progressBar}>
                      <div className={shared.progressFill} style={{ width: `${dl.progress}%` }} />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.searchModeDesc}>
                      Combines BM25 with vector similarity for better recall.
                    </div>
                    <div className={styles.searchModeModel}>
                      Requires local models (~1.5 GB download)
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disk Space */}
      {workspaceSpace && workspaceSpace.total > 0 && (
        <div className={shared.card}>
          <div className={shared.cardHeader}>
            <HardDrive size={14} strokeWidth={1.5} style={{ marginRight: 6 }} />
            Disk Usage
          </div>
          <div className={shared.cardBody}>
            <div className={styles.spaceTotal}>{formatSize(workspaceSpace.total)}</div>
            <div className={styles.spaceBar}>
              {workspaceSpace.conversations > 0 && (
                <div
                  className={styles.spaceSegConv}
                  style={{ flex: workspaceSpace.conversations }}
                  title={`Conversations: ${formatSize(workspaceSpace.conversations)}`}
                />
              )}
              {workspaceSpace.knowledge > 0 && (
                <div
                  className={styles.spaceSegKnow}
                  style={{ flex: workspaceSpace.knowledge }}
                  title={`Knowledge: ${formatSize(workspaceSpace.knowledge)}`}
                />
              )}
              {workspaceSpace.attachments > 0 && (
                <div
                  className={styles.spaceSegAtt}
                  style={{ flex: workspaceSpace.attachments }}
                  title={`Attachments: ${formatSize(workspaceSpace.attachments)}`}
                />
              )}
            </div>
            <div className={styles.spaceLegend}>
              <span className={styles.spaceLegendItem}>
                <span className={`${styles.spaceDot} ${styles.spaceDotConv}`} />
                Conversations {formatSize(workspaceSpace.conversations)}
              </span>
              <span className={styles.spaceLegendItem}>
                <span className={`${styles.spaceDot} ${styles.spaceDotKnow}`} />
                Knowledge {formatSize(workspaceSpace.knowledge)}
              </span>
              {workspaceSpace.attachments > 0 && (
                <span className={styles.spaceLegendItem}>
                  <span className={`${styles.spaceDot} ${styles.spaceDotAtt}`} />
                  Attachments {formatSize(workspaceSpace.attachments)}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {showDownloadModal && (
        <ModelDownloadModal
          models={missingModels}
          onComplete={startDownload}
          onCancel={handleDownloadCancel}
        />
      )}

      {showRenameModal && (
        <RenameWorkspaceModal
          currentName={workspace.name}
          onClose={() => setShowRenameModal(false)}
          onRename={handleRename}
        />
      )}
    </div>
  );
}
