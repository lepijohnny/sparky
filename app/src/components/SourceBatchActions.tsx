import { useCallback } from "react";
import { Trash2 } from "lucide-react";
import { useConnection } from "../context/ConnectionContext";
import InlineMenu from "./shared/InlineMenu";
import batchStyles from "../pages/chat/BatchActionsPage.module.css";
import type { Source } from "../types/source";

export default function SourceBatchActions({ sources, onClear }: { sources: Source[]; onClear: () => void }) {
  const { conn } = useConnection();
  const handleDelete = useCallback(async () => {
    if (!conn) return;
    for (const s of sources) {
      await conn.request("kt.sources.delete", { id: s.id });
    }
    onClear();
  }, [conn, sources, onClear]);

  const actions: import("./shared/ContextMenu").ContextMenuAction[] = [
    {
      label: "Delete",
      icon: <Trash2 size={12} strokeWidth={1.5} />,
      danger: true,
      onClick: handleDelete,
    },
  ];

  return (
    <div className={batchStyles.container}>
      <div className={batchStyles.badge}>{sources.length}</div>
      <span className={batchStyles.hint}>sources selected</span>
      <InlineMenu actions={actions} />
    </div>
  );
}
