import { Archive, Flag, Tag, Trash2 } from "lucide-react";
import { memo, useCallback } from "react";
import type { ContextMenuAction } from "../../components/shared/ContextMenu";
import InlineMenu from "../../components/shared/InlineMenu";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import { buildLabelSubmenu } from "../../lib/labelActions";
import type { Chat } from "../../types/chat";
import styles from "./BatchActionsPage.module.css";

interface BatchActionsPageProps {
  chats: Chat[];
  onClear: () => void;
}

export default memo(function BatchActionsPage({ chats, onClear }: BatchActionsPageProps) {
  const { conn } = useConnection();
  const labels = useStore((s) => s.labels);

  const allFlagged = chats.every((c) => c.flagged);
  const allArchived = chats.every((c) => c.archived);

  // Build a synthetic "merged" chat for label submenu —
  // show checkmark only if ALL selected chats have that label
  const mergedChat: Chat = {
    ...chats[0],
    labels: labels
      .filter((l) => chats.every((c) => (c.labels ?? []).includes(l.id)))
      .map((l) => l.id),
  };

  const handleFlag = useCallback(async () => {
    if (!conn) return;
    const value = !allFlagged;
    for (const chat of chats) {
      await conn.request("chat.flag", { id: chat.id, flagged: value });
    }
  }, [conn, chats, allFlagged]);

  const handleArchive = useCallback(async () => {
    if (!conn) return;
    const value = !allArchived;
    for (const chat of chats) {
      await conn.request("chat.archive", { id: chat.id, archived: value });
    }
  }, [conn, chats, allArchived]);

  const handleDelete = useCallback(async () => {
    if (!conn) return;
    for (const chat of chats) {
      await conn.request("chat.delete", { id: chat.id });
    }
    onClear();
  }, [conn, chats, onClear]);

  // Build label submenu that toggles label on ALL selected chats
  const labelSubmenu: ContextMenuAction[] = buildLabelSubmenu(conn, mergedChat, labels).map((action) => ({
    ...action,
    onClick: () => {
      if (!conn) return;
      const label = labels.find((l) => l.name === action.label);
      if (!label) return;
      for (const chat of chats) {
        const current = chat.labels ?? [];
        const has = current.includes(label.id);
        const next = has ? current.filter((id) => id !== label.id) : [...current, label.id];
        conn.request("chat.label", { id: chat.id, labels: next });
      }
    },
  }));

  const actions: ContextMenuAction[] = [
    {
      label: "Label",
      icon: <Tag size={12} strokeWidth={1.5} />,
      submenu: labelSubmenu,
    },
    {
      label: allFlagged ? "Unflag" : "Flag",
      icon: <Flag size={12} strokeWidth={1.5} />,
      onClick: handleFlag,
    },
    {
      label: allArchived ? "Unarchive" : "Archive",
      icon: <Archive size={12} strokeWidth={1.5} />,
      onClick: handleArchive,
    },
    {
      label: "Delete",
      icon: <Trash2 size={12} strokeWidth={1.5} />,
      danger: true,
      onClick: handleDelete,
    },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.badge}>{chats.length}</div>
      <span className={styles.hint}>chats selected</span>
      <InlineMenu actions={actions} />
    </div>
  );
})
