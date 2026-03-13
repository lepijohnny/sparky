import {
  File,
  Folder,
  Globe,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useWsRequest } from "../../hooks/useWsRequest";
import { useWsSubscriber } from "../../hooks/useWsSubscriber";
import type { Source, SourceFile } from "../../types/source";
import shared from "../../styles/shared.module.css";
import styles from "./SourceDetailsPage.module.css";

const TYPE_ICONS: Record<Source["type"], React.ReactNode> = {
  file: <File size={14} strokeWidth={1.5} />,
  folder: <Folder size={14} strokeWidth={1.5} />,
  url: <Globe size={14} strokeWidth={1.5} />,
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  indexing: "Indexing…",
  ready: "Ready",
  error: "Error",
  cancelled: "Cancelled",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface SourceDetailsPageProps {
  source: Source;
  onDelete: () => void;
}

export default function SourceDetailsPage({ source: initialSource, onDelete }: SourceDetailsPageProps) {
  const { conn } = useConnection();
  const { data } = useWsRequest<{ source: Source; files: SourceFile[] } | null>(
    conn, "kt.sources.get", { id: initialSource.id }, [initialSource.id],
  );

  const [source, setSource] = useState(initialSource);
  const [files, setFiles] = useState<SourceFile[]>([]);

  useEffect(() => {
    if (data) {
      setSource(data.source);
      setFiles(data.files);
    }
  }, [data]);

  // Real-time: update source + files directly from broadcast
  useWsSubscriber<{ source: Source; files?: SourceFile[] }>(conn, "kt.source.updated", (ev) => {
    if (ev.source.id === initialSource.id) {
      setSource(ev.source);
      if (ev.files) setFiles(ev.files);
    }
  });

  const handleReindex = async () => {
    if (!conn) return;
    try {
      await conn.request("kt.sources.reindex", { id: source.id, force: true });
    } catch (err) {
      console.error("Reindex failed:", err);
    }
  };

  const handleCancel = async () => {
    if (!conn) return;
    try {
      await conn.request("kt.sources.cancel", { id: source.id });
    } catch (err) {
      console.error("Cancel failed:", err);
    }
  };

  const handleDelete = async () => {
    if (!conn) return;
    try {
      await conn.request("kt.sources.delete", { id: source.id });
      onDelete();
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  return (
    <div className={shared.contentArea}>
      {/* Info card */}
      <div className={shared.card}>
        <div className={shared.cardHeader}>
          Source
          <span className={styles.headerActions}>
            {source.status === "indexing" ? (
              <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={handleCancel} title="Cancel indexing">
                <X size={13} strokeWidth={1.5} />
              </button>
            ) : (
              <button className={styles.iconBtn} onClick={handleReindex} title="Reindex all">
                <RefreshCw size={13} strokeWidth={1.5} />
              </button>
            )}
            <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={handleDelete} title="Delete">
              <Trash2 size={13} strokeWidth={1.5} />
            </button>
          </span>
        </div>
        <div className={shared.cardBody}>
          <div className={styles.infoGrid}>
            <InfoRow label="Type">
              <span className={styles.typeValue}>
                {TYPE_ICONS[source.type]}
                {source.type}
              </span>
            </InfoRow>
            <InfoRow label="Location">
              <span className={styles.location} title={source.location}>
                {source.location}
              </span>
            </InfoRow>
            <InfoRow label="Status">
              <span className={`${styles.statusBadge} ${styles[`status_${source.status}`]}`}>
                {STATUS_LABELS[source.status]}
              </span>
            </InfoRow>
            {source.error && (
              <InfoRow label="Error">
                <span className={styles.errorText}>{source.error}</span>
              </InfoRow>
            )}
            <InfoRow label="Files">{source.fileCount}</InfoRow>
            <InfoRow label="Chunks">{source.chunkCount}</InfoRow>
            <InfoRow label="Added">{formatDate(source.createdAt)}</InfoRow>
          </div>
        </div>
      </div>

      {/* File list (for folders) */}
      {files.length > 1 && (
        <div className={shared.card}>
          <div className={shared.cardHeader}>Files ({files.length})</div>
          <div className={shared.cardBody}>
            <div className={styles.fileList}>
              <div className={styles.fileHeader}>
                <span className={styles.fileColName}>Name</span>
                <span className={styles.fileColExt}>Ext</span>
                <span className={styles.fileColSize}>Size</span>
                <span className={styles.fileColChunks}>Chunks</span>
                <span className={styles.fileColStatus}>Status</span>
              </div>
              {files.map((f) => (
                <div key={f.id} className={styles.fileRow}>
                  <span className={`${styles.fileColName} ${styles.fileName}`} title={f.path}>
                    {f.name}
                  </span>
                  <span className={styles.fileColExt}>
                    <code>{f.ext}</code>
                  </span>
                  <span className={styles.fileColSize}>{formatBytes(f.size)}</span>
                  <span className={styles.fileColChunks}>{f.chunkCount}</span>
                  <span className={`${styles.fileColStatus} ${styles[`status_${f.status}`]}`}>
                    {STATUS_LABELS[f.status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{children}</span>
    </div>
  );
}
