import { Check, Copy, GitBranch, Pencil, Pin, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";
import styles from "./AgentMessageBubble.module.css";

const ICON_SIZE = 12;
const ICON_STROKE = 1.5;

export interface MessageActionsProps {
  rowid: number;
  turnId: string;
  content: string;
  anchored?: boolean;
  onToggleAnchor?: (rowid: number, anchored: boolean) => void;
  onBranch?: (rowid: number) => void;
  onEdit?: (rowid: number, content: string) => void;
  onDeleteTurn?: (turnId: string) => void;
  onEditStart?: () => void;
}

export const MessageActions = memo(function MessageActions({
  rowid, turnId, content, anchored, onToggleAnchor, onBranch, onEdit, onDeleteTurn, onEditStart,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [content]);

  return (
    <div className={styles.messageActions}>
      {onBranch && (
        <button className={styles.anchorBtn} onClick={() => onBranch(rowid)} title="Branch conversation from here">
          <GitBranch size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </button>
      )}
      {onToggleAnchor && (
        <button
          className={`${styles.anchorBtn} ${anchored ? styles.anchorBtnActive : ""}`}
          onClick={() => onToggleAnchor(rowid, !anchored)}
          title={anchored ? "Unpin from context" : "Pin to context"}
        >
          <Pin size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </button>
      )}
      <button className={styles.anchorBtn} onClick={handleCopy} title="Copy raw markdown">
        {copied ? <Check size={ICON_SIZE} strokeWidth={ICON_STROKE} /> : <Copy size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
      </button>
      {onEdit && onEditStart && (
        <button className={styles.anchorBtn} onClick={onEditStart} title="Edit message">
          <Pencil size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </button>
      )}
      {onDeleteTurn && turnId && (
        <button className={`${styles.anchorBtn} ${styles.deleteBtn}`} onClick={() => onDeleteTurn(turnId)} title="Delete turn">
          <Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        </button>
      )}
    </div>
  );
});
