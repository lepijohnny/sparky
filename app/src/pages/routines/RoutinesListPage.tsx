import { MoreHorizontal, Pause, Play, Power, Timer, Trash2 } from "lucide-react";
import { memo, useCallback } from "react";
import ContextMenu from "../../components/shared/ContextMenu";
import type { ContextMenuAction } from "../../components/shared/ContextMenu";
import { useConnection } from "../../context/ConnectionContext";
import { useToasts } from "../../context/ToastContext";
import { useStore } from "../../store";
import styles from "./RoutinesListPage.module.css";

interface Routine {
  id: string;
  name: string;
  cron: string;
  enabled: boolean;
}

interface RoutinesListPageProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDeleted?: () => void;
}

const RoutineItem = memo(function RoutineItem({ id, name, cron, enabled, active, onSelect, actions }: {
  id: string; name: string; cron: string; enabled: boolean; active: boolean;
  onSelect: (id: string) => void; actions: ContextMenuAction[];
}) {
  return (
    <div
      className={`${styles.item} ${active ? styles.itemActive : ""}`}
      onClick={() => onSelect(id)}
    >
      <div className={styles.itemIcon}>
        <Timer size={14} strokeWidth={1.5} style={{ opacity: enabled ? 1 : 0.4 }} />
      </div>
      <div className={styles.itemContent}>
        <div className={styles.itemName}>{name}</div>
        <div className={styles.itemMeta}>
          <span className={styles.itemCron}>{cron}</span>
          {!enabled && <span className={styles.itemDisabled}>Paused</span>}
        </div>
      </div>
      <div className={styles.moreBtn} onClick={(e) => e.stopPropagation()}>
        <ContextMenu actions={actions}>
          <MoreHorizontal size={14} strokeWidth={1.5} />
        </ContextMenu>
      </div>
    </div>
  );
});

export default memo(function RoutinesListPage({ selectedId, onSelect, onDeleted }: RoutinesListPageProps) {
  const routines = useStore((s) => s.routines);
  const { conn } = useConnection();
  const { addToast } = useToasts();

  const actions = useCallback((r: Routine): ContextMenuAction[] => [
    {
      label: r.enabled ? "Disable" : "Enable",
      icon: r.enabled ? <Pause size={14} strokeWidth={1.5} /> : <Power size={14} strokeWidth={1.5} />,
      onClick: () => conn?.request("routine.toggle", { id: r.id, enabled: !r.enabled }),
    },
    {
      label: "Run Now",
      icon: <Play size={14} strokeWidth={1.5} />,
      onClick: async () => {
        try {
          await conn?.request("routine.run", { id: r.id });
          addToast({ id: `run_${Date.now()}`, kind: "info", title: `Running "${r.name}"` });
        } catch (err: any) {
          addToast({ id: `run_err_${Date.now()}`, kind: "error", title: err?.message ?? "Failed" });
        }
      },
      disabled: !r.enabled,
    },
    { divider: true },
    {
      label: "Delete",
      icon: <Trash2 size={14} strokeWidth={1.5} />,
      onClick: async () => {
        await conn?.request("routine.delete", { id: r.id });
        if (selectedId === r.id) onDeleted?.();
      },
      danger: true,
    },
  ], [conn, addToast, selectedId, onDeleted]);

  return (
    <div className={styles.container}>
      {routines.length === 0 ? (
        <div className={styles.empty}>
          <Timer size={20} strokeWidth={1.2} />
          <span>No routines yet</span>
        </div>
      ) : (
        <div className={styles.list}>
          {routines.map((r) => (
            <RoutineItem
              key={r.id}
              id={r.id}
              name={r.name}
              cron={r.cron}
              enabled={r.enabled}
              active={selectedId === r.id}
              onSelect={onSelect}
              actions={actions(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
});
