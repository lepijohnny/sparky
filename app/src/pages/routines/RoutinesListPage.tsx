import { Timer } from "lucide-react";
import { memo } from "react";
import { useStore } from "../../store";
import styles from "./RoutinesListPage.module.css";

interface RoutinesListPageProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const RoutineItem = memo(function RoutineItem({ id, name, cron, enabled, active, onSelect }: {
  id: string; name: string; cron: string; enabled: boolean; active: boolean; onSelect: (id: string) => void;
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
    </div>
  );
});

export default memo(function RoutinesListPage({ selectedId, onSelect }: RoutinesListPageProps) {
  const routines = useStore((s) => s.routines);

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
            />
          ))}
        </div>
      )}
    </div>
  );
});
