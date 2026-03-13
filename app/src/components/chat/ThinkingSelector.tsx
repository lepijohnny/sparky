import { Brain } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./ThinkingSelector.module.css";

const LEVELS = [
  { value: 0, label: "Off" },
  { value: 1, label: "Low" },
  { value: 2, label: "Med" },
  { value: 3, label: "High" },
  { value: 4, label: "Max" },
];

interface Props {
  value: number;
  onChange: (level: number) => void;
  disabled?: boolean;
}

/**
 * Compact thinking level selector — brain icon that opens
 * a popover with Off/Low/Med/High/Max pills.
 */
export default function ThinkingSelector({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      bottom: window.innerHeight - rect.top + 4,
      left: rect.left,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = useCallback(
    (level: number) => {
      onChange(level);
      setOpen(false);
    },
    [onChange],
  );

  const active = value > 0;
  const label = LEVELS[value]?.label ?? "Off";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${active ? styles.triggerActive : ""} ${disabled ? styles.triggerDisabled : ""}`}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        title={`Thinking: ${label}`}
        data-level={value}
      >
        <span className={`${styles.brainIcon} ${active ? styles[`brainLevel${value}`] : ""}`}>
          <Brain size={13} strokeWidth={1.5} />
        </span>
        <span>{label}</span>
      </button>

      {open && !disabled && pos && createPortal(
        <div ref={popoverRef} className={styles.popover} style={pos}>
          {LEVELS.map((level) => (
            <button
              key={level.value}
              type="button"
              className={`${styles.pill} ${level.value === value ? styles.pillActive : ""}`}
              onClick={() => handleSelect(level.value)}
            >
              {level.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
