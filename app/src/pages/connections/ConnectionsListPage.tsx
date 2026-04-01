import { useEffect, useState } from "react";
import { MoreHorizontal, Play, Trash2 } from "lucide-react";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import ContextMenu, { type ContextMenuAction } from "../../components/shared/ContextMenu";
import { serviceTransport, type ServiceInfo } from "../../types/service";
import styles from "./ConnectionsListPage.module.css";

interface ConnectionsListPageProps {
  selectedConnectionId: string | null;
  onSelectConnection: (id: string) => void;
}

export default function ConnectionsListPage({ selectedConnectionId, onSelectConnection }: ConnectionsListPageProps) {
  const { conn } = useConnection();
  const services = useStore((s) => s.connections);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedConnectionId && services.length > 0) {
      onSelectConnection(services[0].id);
    }
  }, [selectedConnectionId, services]);

  const handleTest = async (id: string) => {
    if (!conn) return;
    setTesting(id);
    try {
      await conn.request("svc.test", { service: id });
    } finally {
      setTesting(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!conn) return;
    await conn.request("svc.delete", { service: id });
    if (selectedConnectionId === id) onSelectConnection("");
  };

  const actions = (svc: ServiceInfo): ContextMenuAction[] => [
    {
      label: testing === svc.id ? "Testing…" : "Test",
      icon: <Play size={14} strokeWidth={1.5} />,
      disabled: testing === svc.id,
      onClick: () => handleTest(svc.id),
    },
    { divider: true },
    {
      label: "Delete",
      icon: <Trash2 size={14} strokeWidth={1.5} />,
      danger: true,
      onClick: () => handleDelete(svc.id),
    },
  ];

  if (!services.length) {
    return (
      <div className={styles.empty}>
        <span>No connections yet.</span>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {services.map((svc) => (
        <div
          key={svc.id}
          className={`${styles.item} ${selectedConnectionId === svc.id ? styles.selected : ""}`}
          onClick={() => onSelectConnection(svc.id)}
        >
          {svc.icon ? (
            <img src={svc.icon} alt="" className={styles.icon} />
          ) : (
            <div className={styles.iconPlaceholder} />
          )}
          <div className={styles.info}>
            <span className={styles.name}>{svc.label}</span>
            <span className={styles.meta}>
              <span className={styles.transport}>{serviceTransport(svc)}</span>
              <span className={styles.dot}>·</span>
              <span className={styles.statusOnline}>{svc.endpoints.length} endpoint{svc.endpoints.length !== 1 ? "s" : ""}</span>
            </span>
          </div>
          <div className={styles.moreBtn} onClick={(e) => e.stopPropagation()}>
            <ContextMenu actions={actions(svc)}>
              <MoreHorizontal size={14} strokeWidth={1.5} />
            </ContextMenu>
          </div>
        </div>
      ))}
    </div>
  );
}
