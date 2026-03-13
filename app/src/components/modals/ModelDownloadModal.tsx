import Modal from "./Modal";

interface ModelInfo {
  name: string;
  filename: string;
  size_bytes: number;
}

interface Props {
  models: ModelInfo[];
  onComplete: () => void;
  onCancel: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function ModelDownloadModal({ models, onComplete, onCancel }: Props) {
  const totalSize = models.reduce((sum, m) => sum + m.size_bytes, 0);

  return (
    <Modal
      title="Download Models"
      onClose={onCancel}
      actions={[
        { label: "Cancel", onClick: onCancel },
        { label: "Download", onClick: onComplete, primary: true },
      ]}
    >
      <div style={{ fontSize: 13, color: "var(--fg-muted)", lineHeight: 1.5, marginBottom: 16 }}>
        Hybrid search requires local models for query rewriting and reranking.
        Total download: {formatSize(totalSize)}.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {models.map((m) => (
          <div key={m.filename} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: "var(--fg)" }}>{m.filename}</span>
            <span style={{ color: "var(--fg-muted)" }}>{formatSize(m.size_bytes)}</span>
          </div>
        ))}
      </div>
    </Modal>
  );
}
