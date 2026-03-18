import { ChevronDown, Eye, Pencil, Terminal } from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store";
import { useConnection } from "../../context/ConnectionContext";
import type { PermissionMode } from "../../store/trust";
import type { Chat } from "../../types/chat";
import styles from "./ModeSelector.module.css";

const MODES: { id: PermissionMode; label: string; icon: typeof Eye; description: string }[] = [
  { id: "read", label: "Read", icon: Eye, description: "Read files, search, browse" },
  { id: "write", label: "Write", icon: Pencil, description: "Read + write and edit files" },
  { id: "execute", label: "Execute", icon: Terminal, description: "Read + write + run commands" },
];

interface Props {
  chat: Chat;
}

export default memo(function ModeSelector({ chat }: Props) {
  const trust = useStore((s) => s.trust);
  const { conn } = useConnection();
  const [open, setOpen] = useState(false);
  const [focusIdx, setFocusIdx] = useState(-1);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentMode = (chat.mode as PermissionMode | undefined) ?? trust.mode;
  const activeIdx = MODES.findIndex((m) => m.id === currentMode);
  const active = MODES[activeIdx] ?? MODES[0];
  const Icon = active.icon;

  const isOverridden = chat.mode != null;

  const handleSelect = useCallback(async (mode: PermissionMode | null) => {
    setOpen(false);
    if (!conn) return;
    if (mode === null && !isOverridden) return;
    if (mode !== null && mode === currentMode && isOverridden) return;
    try {
      await conn.request("chat.mode", { id: chat.id, mode });
    } catch (err) {
      console.error("Failed to set chat mode:", err);
    }
  }, [currentMode, isOverridden, conn, chat]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 4,
      right: window.innerWidth - rect.right,
      minWidth: 200,
    });
    setFocusIdx(activeIdx >= 0 ? activeIdx : 0);
  }, [open, activeIdx]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        listRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const max = MODES.length - 1 + (isOverridden ? 1 : 0);
      setFocusIdx((i) => Math.min(i + 1, max));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const offset = isOverridden ? 1 : 0;
      if (isOverridden && focusIdx === 0) { handleSelect(null); }
      else { const m = MODES[focusIdx - offset]; if (m) handleSelect(m.id); }
    }
  }, [open, focusIdx, isOverridden, handleSelect]);

  return (
    <>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${styles[`mode_${active.id}`]}`}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={active.description}
      >
        <Icon size={12} strokeWidth={1.5} />
        <span className={styles.triggerLabel}>{active.label}</span>
        <ChevronDown size={10} strokeWidth={1.5} className={styles.chevron} />
      </button>
      {open && pos && createPortal(
        <div
          ref={listRef}
          className={styles.list}
          style={pos}
          role="listbox"
          onKeyDown={handleKeyDown}
        >
          {isOverridden && (
            <div
              className={`${styles.item} ${focusIdx === 0 ? styles.itemFocused : ""}`}
              onClick={() => handleSelect(null)}
              onMouseEnter={() => setFocusIdx(0)}
            >
              <div className={styles.itemRow}>
                <span className={styles.itemLabel}>Default ({trust.mode})</span>
              </div>
              <span className={styles.itemDesc}>Inherit from global settings</span>
            </div>
          )}
          {MODES.map((mode, idx) => {
            const MIcon = mode.icon;
            const selected = mode.id === currentMode;
            const offset = isOverridden ? 1 : 0;
            const focused = idx + offset === focusIdx;
            return (
              <div
                key={mode.id}
                className={`${styles.item} ${selected ? styles.itemSelected : ""} ${focused ? styles.itemFocused : ""}`}
                role="option"
                aria-selected={selected}
                onClick={() => handleSelect(mode.id)}
                onMouseEnter={() => setFocusIdx(idx + offset)}
              >
                <div className={styles.itemRow}>
                  <MIcon size={14} strokeWidth={1.5} className={styles[`icon_${mode.id}`]} />
                  <span className={styles.itemLabel}>{mode.label}</span>
                </div>
                <span className={styles.itemDesc}>{mode.description}</span>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
});
