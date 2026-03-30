import {
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Flag,
  Blocks,
  BookOpen,
  FolderOpen,
  FolderPlus,
  GripVertical,
  MessageSquare,
  Cable,
  Settings,
  SquarePen,
  Tag,
  FileText,
  Unplug,
  Puzzle,
  Timer,
} from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import NewWorkspaceModal from "../components/modals/NewWorkspaceModal";
import { useConnection } from "../context/ConnectionContext";

import { useLabelDragReorder } from "../hooks/useLabelDragReorder";
import { useWsRequest } from "../hooks/useWsRequest";
import { useStore } from "../store";
import type { Label } from "../types/label";
import type { Workspace } from "../types/workspace";

import styles from "./MenuPanel.module.css";

export type { Section } from "../store/types";

const ICON_SIZE = 16;
const ICON_STROKE = 1.5;

const NAV_BEFORE_LABELS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "chats",    label: "Chats",    icon: <MessageSquare size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "flagged",  label: "Flagged",  icon: <Flag size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "archived", label: "Archived", icon: <Archive size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
];

const NAV_AFTER_LABELS: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "sources",      label: "Knowledge",    icon: <BookOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "connections",  label: "Connections",  icon: <Blocks size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
  { id: "skills",       label: "Skills",       icon: <Puzzle size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
];

const NAV_ROUTINES: { id: Section; label: string; icon: ReactNode }[] = [
  { id: "routines",     label: "Routines",     icon: <Timer size={ICON_SIZE} strokeWidth={ICON_STROKE} /> },
];

const SECRET_CLICKS = 7;
const SECRET_WINDOW = 2000;

interface MenuPanelProps {
  wsStatus: "connected" | "disconnected";
  wsPort: number | null;
  section: Section;
  selectedLabel: string | null;
  labels: Label[];
  debugUnlocked: boolean;
  onSectionChange: (section: Section) => void;
  onLabelSelect: (labelId: string | null) => void;
  onNewChat: () => void;
  onOpenLogs: () => void;
  onDebugUnlock: () => void;
}

export default function MenuPanel({
  wsStatus, wsPort, section, selectedLabel, labels,
  debugUnlocked,
  onSectionChange, onLabelSelect, onNewChat, onOpenLogs, onDebugUnlock,
}: MenuPanelProps) {
  const { conn } = useConnection();
  const chats = useStore((s) => s.chats);
  const counts = useMemo(() => useStore.getState().getChatCounts(), [chats]);
  const sourceCount = useStore((s) => s.sources.length);

  const [labelsExpanded, setLabelsExpanded] = useState(false);
  const [wsExpanded, setWsExpanded] = useState(false);
  const [showNewWsModal, setShowNewWsModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: wsData } = useWsRequest<{ workspaces: Workspace[] }>(
    conn, "settings.workspace.list", undefined, [refreshKey],
  );
  const { data: activeData } = useWsRequest<{ activeWorkspace: string | null }>(
    conn, "settings.workspace.active.get", undefined, [refreshKey],
  );

  useEffect(() => {
    if (!conn) return;
    return conn.subscribe("settings.workspace.changed", () => setRefreshKey((k) => k + 1));
  }, [conn]);

  const workspaces = wsData?.workspaces ?? [];
  const activeWorkspaceId = activeData?.activeWorkspace ?? null;

  const SECTION_COUNTS: Partial<Record<Section, number>> = {
    chats: counts.chats,
    flagged: counts.flagged,
    archived: counts.archived,
  };

  const handleWorkspaceChange = async (id: string) => {
    if (!conn) return;
    try {
      await conn.request("settings.workspace.active.set", { id });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to set active workspace:", err);
    }
  };

  const handleCreateWorkspace = async (name: string) => {
    if (!conn) return;
    try {
      const res = await conn.request<{ workspace: Workspace }>("settings.workspace.add", { name });
      setShowNewWsModal(false);
      await conn.request("settings.workspace.active.set", { id: res.workspace.id });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      console.error("Failed to add workspace:", err);
    }
  };

  const connected = wsStatus === "connected";

  return (
    <>
      <button className={styles.newChatBtn} onClick={onNewChat}>
        <SquarePen size={14} strokeWidth={ICON_STROKE} />
        New Chat
      </button>

      <nav className={styles.navList}>
        {NAV_BEFORE_LABELS.map((item) => {
          const count = SECTION_COUNTS[item.id];
          return (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              count={count}
              active={section === item.id}
              onClick={() => onSectionChange(item.id)}
            />
          );
        })}

        {/* Labels — collapsible */}
        <div
          className={`${styles.navItem} ${section === "labels" && !selectedLabel ? styles.navItemActive : ""}`}
          onClick={() => {
            onSectionChange("labels");
            onLabelSelect(null);
          }}
        >
          <span
            className={styles.itemIcon}
            onClick={(e) => { e.stopPropagation(); setLabelsExpanded((v) => !v); }}
          >
            <span className={styles.labelsIcon}><Tag size={ICON_SIZE} strokeWidth={ICON_STROKE} /></span>
            <span className={styles.labelsChevron}>
              {labelsExpanded
                ? <ChevronDown size={12} strokeWidth={1.5} />
                : <ChevronRight size={12} strokeWidth={1.5} />
              }
            </span>
          </span>
          Labels
          {counts.labeled > 0 && <span className={styles.navCount}>{counts.labeled}</span>}
        </div>

        {labels.length > 0 && (
          <LabelsList
            labels={labels}
            expanded={labelsExpanded}
            selectedLabel={selectedLabel}
            counts={counts.labels}
            onSelect={(id) => { onSectionChange("labels"); onLabelSelect(id); }}
            onReorder={(ids) => conn?.request("settings.labels.reorder", { ids })}
          />
        )}

        <div className={styles.navDivider} />

        {NAV_AFTER_LABELS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            count={item.id === "sources" ? sourceCount : undefined}
            active={section === item.id}
            onClick={() => onSectionChange(item.id)}
          />
        ))}

        <div className={styles.navDivider} />

        {NAV_ROUTINES.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={section === item.id}
            onClick={() => onSectionChange(item.id)}
          />
        ))}

        <div className={styles.navDivider} />

        <NavItem
          icon={<Settings size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
          label="Settings"
          active={section === "settings"}
          onClick={() => onSectionChange("settings")}
        />
      </nav>

      <WorkspaceBar
        workspaces={workspaces}
        activeId={activeWorkspaceId}
        expanded={wsExpanded}
        onToggle={() => setWsExpanded((p) => !p)}
        onChange={(id) => { handleWorkspaceChange(id); setWsExpanded(false); }}
        onNew={() => { setWsExpanded(false); setShowNewWsModal(true); }}
      />

      {showNewWsModal && (
        <NewWorkspaceModal
          onClose={() => setShowNewWsModal(false)}
          onCreate={handleCreateWorkspace}
        />
      )}
    </>
  );
}

// ── Sub-components ──

function NavItem({ icon, label, count, active, onClick }: {
  icon: ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
      onClick={onClick}
    >
      <span className={styles.itemIcon}>{icon}</span>
      {label}
      {count !== undefined && count > 0 && (
        <span className={styles.navCount}>{count}</span>
      )}
    </div>
  );
}

function LabelsList({ labels, expanded, selectedLabel, counts, onSelect, onReorder }: {
  labels: Label[];
  expanded: boolean;
  selectedLabel: string | null;
  counts: Record<string, number>;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
}) {
  const drag = useLabelDragReorder(labels, (reordered) => {
    onReorder(reordered.map((l) => l.id));
  });

  return (
    <div className={`${styles.labelsWrap} ${expanded ? styles.labelsWrapOpen : ""}`}>
      <div className={styles.labelsInner}>
        <div className={styles.labelsList}>
          {drag.items.map((label, i) => (
            <div
              key={label.id}
              data-drag-idx={i}
              className={`${styles.labelItem} ${selectedLabel === label.id ? styles.labelItemActive : ""} ${drag.dragIndex === i ? styles.labelItemDragging : ""}`}
              onClick={() => { if (drag.dragIndex === null) onSelect(label.id); }}
            >
              <span className={styles.labelDot} style={{ background: label.color }} />
              <span className={styles.labelName}>{label.name}</span>
              {counts[label.id] ? (
                <span className={`${styles.navCount} ${styles.labelCount}`}>{counts[label.id]}</span>
              ) : null}
              <span className={styles.labelGrip} {...drag.gripProps(i)}>
                <GripVertical size={10} strokeWidth={1.5} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WorkspaceBar({ workspaces, activeId, expanded, onToggle, onChange, onNew }: {
  workspaces: Workspace[];
  activeId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onChange: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className={styles.workspaceBar}>
      {expanded && (
        <div className={styles.wsExpandedList}>
          {workspaces.map((w) => (
            <div
              key={w.id}
              className={`${styles.wsItem} ${w.id === activeId ? styles.wsItemActive : ""}`}
              onClick={() => onChange(w.id)}
            >
              <span className={styles.wsItemLabel}>{w.name}</span>
              {w.id === activeId && <Check size={12} strokeWidth={2} />}
            </div>
          ))}
          <div className={styles.wsListDivider} />
          <div className={styles.newWsItem} onClick={onNew}>
            <FolderPlus size={14} strokeWidth={1.5} />
            New Workspace…
          </div>
        </div>
      )}
      <button className={styles.wsTrigger} onClick={onToggle}>
        <span className={styles.wsTriggerLabel}>
          {workspaces.find((w) => w.id === activeId)?.name ?? "Select workspace…"}
        </span>
        <ChevronUp size={12} strokeWidth={1.5} className={`${styles.wsChevron} ${expanded ? styles.wsChevronOpen : ""}`} />
      </button>
    </div>
  );
}

function StatusBar({ connected, wsPort, debugUnlocked, onOpenLogs, onDebugUnlock }: {
  connected: boolean;
  wsPort: number | null;
  debugUnlocked: boolean;
  onOpenLogs: () => void;
  onDebugUnlock: () => void;
}) {
  const clickTimes = useRef<number[]>([]);

  return (
    <div className={styles.statusBar}>
      <div
        className={styles.statusRow}
        onClick={() => {
          if (debugUnlocked) return;
          const now = Date.now();
          clickTimes.current.push(now);
          clickTimes.current = clickTimes.current.filter((t) => now - t < SECRET_WINDOW);
          if (clickTimes.current.length >= SECRET_CLICKS) {
            onDebugUnlock();
            clickTimes.current = [];
          }
        }}
      >
        <span className={connected ? styles.iconOn : styles.iconOff}>
          {connected
            ? <Cable size={14} strokeWidth={ICON_STROKE} />
            : <Unplug size={14} strokeWidth={ICON_STROKE} />
          }
        </span>
        <span className={styles.statusText}>
          {connected ? `ws:${wsPort}` : "Disconnected"}
        </span>
      </div>
      <button className={styles.logBtn} onClick={onOpenLogs} title="Open logs">
        <FileText size={14} strokeWidth={ICON_STROKE} />
      </button>
    </div>
  );
}
