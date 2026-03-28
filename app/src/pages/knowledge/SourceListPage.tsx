import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Globe,
  Link,
  MoreHorizontal,
  Play,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { open as shellOpen } from "@tauri-apps/plugin-shell";
import { useConnection } from "../../context/ConnectionContext";
import { useWsRequest } from "../../hooks/useWsRequest";
import { useListSelection } from "../../hooks/useListSelection";
import { useStore } from "../../store";

import { groupByDate } from "../../lib/dateGroups";
import type { Source } from "../../types/source";
import ContextMenu from "../../components/shared/ContextMenu";
import type { ContextMenuAction } from "../../components/shared/ContextMenu";
import Empty from "../../components/shared/Empty";
import styles from "./SourceListPage.module.css";

const ICON_SIZE = 14;
const ICON_STROKE = 1.5;

const TYPE_ICONS: Record<Source["type"], React.ReactNode> = {
  file: <File size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  folder: <Folder size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
  url: <Globe size={ICON_SIZE} strokeWidth={ICON_STROKE} />,
};

const STATUS_LABELS: Record<Source["status"], string> = {
  pending: "Pending",
  indexing: "Indexing…",
  ready: "Ready",
  error: "Error",
  cancelled: "Cancelled",
};

interface SourceListPageProps {
  selectedSourceId: string | null;
  onSelectSource: (source: Source) => void;
  onToggleSelect: (source: Source) => void;
  onRangeSelect: (source: Source, all: Source[]) => void;
  onSelectAll: (sources: Source[]) => void;
  multiSelectedIds: Set<string> | undefined;
  showUrlInput: boolean;
  onUrlSubmit: (url: string) => void;
  onUrlCancel: () => void;
}

export default function SourceListPage({
  selectedSourceId,
  onSelectSource,
  onToggleSelect,
  onRangeSelect,
  onSelectAll,
  multiSelectedIds,
  showUrlInput,
  onUrlSubmit,
  onUrlCancel,
}: SourceListPageProps) {
  const { conn } = useConnection();
  const { data: extData } = useWsRequest<{ extensions: string[] }>(conn, "kt.sources.extensions");
  const extensions = extData?.extensions ?? [];
  const sources = useStore((s) => s.sources);
  const [urlValue, setUrlValue] = useState("");

  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!selectedSourceId && sources.length > 0) {
      onSelectSource(sources[0]);
    }
  }, [selectedSourceId, sources]);

  // Focus URL input when shown
  useEffect(() => {
    if (showUrlInput) {
      setUrlValue("");
      urlInputRef.current?.focus();
    }
  }, [showUrlInput]);

  const selection = useListSelection(
    sources,
    selectedSourceId,
    multiSelectedIds,
    { onSelect: onSelectSource, onToggle: onToggleSelect, onRange: onRangeSelect, onSelectAll },
  );

  const handleUrlKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      const url = urlValue.trim();
      if (url) onUrlSubmit(url);
      setUrlValue("");
    }
    if (e.key === "Escape") {
      setUrlValue("");
      onUrlCancel();
    }
  }, [urlValue, onUrlSubmit, onUrlCancel]);

  const groups = useMemo(
    () => groupByDate(sources, (s) => s.updatedAt),
    [sources],
  );

  const collapsed = useStore((s) => s.collapsedGroups);
  const toggleCollapsed = useStore((s) => s.toggleCollapsedGroup);

  const renderSourceItem = (source: Source) => {
    const actions: ContextMenuAction[] = [];
    if (source.type !== "url") {
      actions.push({
        label: "Open in Finder",
        icon: <FolderOpen size={14} strokeWidth={1.5} />,
        onClick: () => {
          if (source.type === "file") {
            import("@tauri-apps/api/core").then(({ invoke }) =>
              invoke("reveal_in_finder", { path: source.location })
            ).catch((err) => console.error("reveal failed:", err));
          } else {
            shellOpen(source.location).catch((err) => console.error("shellOpen failed:", err));
          }
        },
      });
    }
    actions.push({
      label: "Reindex all",
      icon: <RefreshCw size={14} strokeWidth={1.5} />,
      onClick: () => {
        conn?.request("kt.sources.reindex", { id: source.id, force: true }).catch((err) => console.error("reindex failed:", err));
      },
      disabled: source.status === "indexing",
    });
    actions.push({
      label: "Delete",
      icon: <Trash2 size={14} strokeWidth={1.5} />,
      danger: true,
      onClick: () => conn?.request("kt.sources.delete", { id: source.id }),
    });

    return (
      <div
        key={source.id}
        className={`${styles.item} ${selection.isSelected(source.id) ? styles.itemActive : ""}`}
        onClick={(e) => selection.handleClick(e, source, sources)}
        onMouseDown={selection.handleMouseDown}
      >
        {source.status === "indexing" && <div className={styles.progressLine} />}
        <span className={styles.itemIcon}>{TYPE_ICONS[source.type]}</span>
        <div className={styles.itemContent}>
          <span className={styles.itemName}>{source.name.length > 40 ? source.name.slice(0, 40) + "…" : source.name}</span>
          <span className={styles.itemMeta}>
            <span className={`${styles.badge} ${styles[`badge_${source.status}`]}`}>
              {STATUS_LABELS[source.status]}
            </span>
            <span className={styles.modeBadge}>{source.mode === "hybrid" ? "Hybrid" : "BM25"}</span>
            {source.chunkCount > 0 && (
              <span className={styles.chunkCount}>{source.chunkCount} chunks</span>
            )}
            {source.status === "cancelled" && (
              <button
                className={styles.continueBtn}
                title="Continue indexing"
                onClick={(e) => { e.stopPropagation(); conn?.request("kt.sources.reindex", { id: source.id }); }}
              >
                <Play size={10} strokeWidth={2} /> Resume
              </button>
            )}
          </span>
        </div>
        <div className={styles.itemActions} onClick={(e) => e.stopPropagation()}>
          {source.status === "indexing" && (
            <button
              className={styles.cancelBtn}
              title="Cancel indexing"
              onClick={() => conn?.request("kt.sources.cancel", { id: source.id })}
            >
              <X size={12} strokeWidth={2} />
            </button>
          )}
          <ContextMenu actions={actions} align="right">
            <button className={styles.menuBtn}>
              <MoreHorizontal size={14} strokeWidth={1.5} />
            </button>
          </ContextMenu>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      {showUrlInput && (
        <div className={styles.urlBar}>
          <Link size={12} strokeWidth={1.5} className={styles.urlIcon} />
          <input
            ref={urlInputRef}
            className={styles.urlInput}
            placeholder="https://..."
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            onBlur={() => { if (!urlValue.trim()) { setUrlValue(""); onUrlCancel(); } }}
          />
        </div>
      )}

      {sources.length === 0 && !showUrlInput ? (
        <div className={styles.empty}>
          <FolderOpen size={20} strokeWidth={1.2} />
          <span>No sources yet</span>
          {extensions.length > 0 && (
            <span className={styles.hint}>
              Supported: {extensions.map(e => e.replace('.', '')).join(', ')}
            </span>
          )}
        </div>
      ) : (
        <div className={styles.list}>
          {groups.map((group) => (
            <div key={group.label}>
              <div className={styles.dateDivider} onClick={() => toggleCollapsed(group.label)}>
                <ChevronRight size={12} strokeWidth={1.5} className={`${styles.chevron} ${collapsed.has(group.label) ? "" : styles.chevronOpen}`} />
                {group.label}
              </div>
              {!collapsed.has(group.label) && group.items.map((source) => renderSourceItem(source))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
