import { Pencil, Pin, X } from "lucide-react";
import { memo, useCallback, useRef } from "react";
import type { ChatMessage } from "../../types/chat";
import styles from "./AnchorTray.module.css";

interface AnchorTrayProps {
  entries: ChatMessage[];
  onUnpin: (rowid: number) => void;
  onJump: (rowid: number) => void;
  onRename: (rowid: number, name: string) => void;
}

export default memo(function AnchorTray({ entries, onUnpin, onJump, onRename }: AnchorTrayProps) {
  if (entries.length === 0) return null;

  return (
    <div className={styles.tray}>
      {entries.map((entry, i) => (
        <AnchorItem
          key={entry.rowid}
          entry={entry}
          isFirst={i === 0}
          onUnpin={onUnpin}
          onJump={onJump}
          onRename={onRename}
        />
      ))}
    </div>
  );
});

function AnchorItem({ entry, isFirst, onUnpin, onJump, onRename }: {
  entry: ChatMessage;
  isFirst: boolean;
  onUnpin: (rowid: number) => void;
  onJump: (rowid: number) => void;
  onRename: (rowid: number, name: string) => void;
}) {
  const previewRef = useRef<HTMLSpanElement>(null);
  const escapedRef = useRef(false);
  const editingRef = useRef(false);

  const handleUnpin = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (entry.rowid != null) onUnpin(entry.rowid);
  }, [entry.rowid, onUnpin]);

  const handleJump = useCallback(() => {
    if (entry.rowid != null) onJump(entry.rowid);
  }, [entry.rowid, onJump]);

  const handleEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const el = previewRef.current;
    if (!el) return;
    editingRef.current = true;
    el.contentEditable = "true";
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    if (sel) { sel.removeAllRanges(); sel.addRange(range); }
  }, []);

  const handleBlur = useCallback(() => {
    editingRef.current = false;
    if (previewRef.current) previewRef.current.contentEditable = "false";
    if (escapedRef.current) { escapedRef.current = false; return; }
    if (entry.rowid == null) return;
    const text = previewRef.current?.textContent?.trim() ?? "";
    const preview = entry.content.replace(/\n/g, " ").slice(0, 80);
    if (text !== (entry.anchorName ?? preview)) {
      onRename(entry.rowid, text);
    }
  }, [entry.rowid, entry.anchorName, entry.content, onRename]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      previewRef.current?.blur();
      const el = previewRef.current;
      if (el) {
        el.classList.add(styles.flash);
        setTimeout(() => el.classList.remove(styles.flash), 300);
      }
    }
    if (e.key === "Escape") {
      e.preventDefault();
      escapedRef.current = true;
      const preview = entry.anchorName || entry.content.replace(/\n/g, " ").slice(0, 80);
      if (previewRef.current) previewRef.current.textContent = preview;
      window.getSelection()?.removeAllRanges();
      previewRef.current?.blur();
    }
  }, [entry.anchorName, entry.content]);

  const preview = entry.content.replace(/\n/g, " ").slice(0, 80);
  const displayText = entry.anchorName || preview;

  return (
    <div className={styles.item} onClick={handleJump}>
      <Pin size={12} strokeWidth={1.5} className={styles.icon} />
      <span
        ref={previewRef}
        className={styles.preview}
        suppressContentEditableWarning
        spellCheck={false}
        onClick={(e) => { if (editingRef.current) e.stopPropagation(); }}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      >
        {displayText}
      </span>
      <button className={styles.rename} onClick={handleEdit} title="Rename">
        <Pencil size={11} strokeWidth={1.5} />
      </button>
      <button className={styles.unpin} onClick={handleUnpin} title="Unpin">
        <X size={11} strokeWidth={1.5} />
      </button>
    </div>
  );
}
