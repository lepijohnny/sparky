import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import styles from "./Dropdown.module.css";

interface Option {
  value: string;
  label: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function Dropdown({ options, value, onChange, placeholder, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((o) => o.value === value);

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

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
      width: 280,
    });
  }, [open]);

  useEffect(() => {
    if (open && selectedRef.current && listRef.current) {
      selectedRef.current.scrollIntoView({ block: "nearest" });
    }
  }, [open, pos]);

  const handleSelect = useCallback((val: string) => {
    onChange(val);
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((prev) => !prev);
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      if (idx < options.length - 1) onChange(options[idx + 1].value);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = options.findIndex((o) => o.value === value);
      if (idx > 0) onChange(options[idx - 1].value);
    }
  }, [disabled, options, value, onChange]);

  return (
    <>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
        onClick={() => !disabled && setOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        type="button"
        disabled={disabled}
      >
        <span className={styles.triggerLabel}>
          {selectedOption?.label ?? placeholder ?? "Select…"}
        </span>
        <span className={styles.chevron}>▾</span>
      </button>
      {open && pos && (
        <div ref={listRef} className={styles.list} style={pos}>
          {options.map((opt) => (
            <div
              key={opt.value}
              ref={opt.value === value ? selectedRef : undefined}
              className={`${styles.item} ${opt.value === value ? styles.itemSelected : ""}`}
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </div>
          ))}

        </div>
      )}
    </>
  );
}
