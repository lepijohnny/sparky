import { Check } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import styles from "./ColorPicker.module.css";

const PALETTE = [
  "hsl(340, 65%, 60%)",
  "hsl(20, 70%, 55%)",
  "hsl(40, 75%, 55%)",
  "hsl(80, 55%, 50%)",
  "hsl(150, 50%, 45%)",
  "hsl(175, 55%, 45%)",
  "hsl(195, 65%, 50%)",
  "hsl(215, 65%, 55%)",
  "hsl(240, 55%, 60%)",
  "hsl(265, 50%, 60%)",
  "hsl(285, 45%, 55%)",
  "hsl(320, 55%, 60%)",
];

export { PALETTE };

interface ColorPickerProps {
  current: string;
  onSelect: (color: string) => void;
  onClose: () => void;
  children: React.ReactNode;
}

export default function ColorPicker({ current, onSelect, onClose, children }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: rect.right - 180, // right-aligned, 180px wide
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();

    const handleClick = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose, updatePos]);

  return (
    <div ref={triggerRef} className={styles.wrapper}>
      <div onClick={() => setOpen((o) => !o)}>
        {children}
      </div>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className={styles.dropdown}
          style={{ top: pos.top, left: pos.left }}
        >
          {PALETTE.map((color) => (
            <button
              key={color}
              className={`${styles.swatch} ${color === current ? styles.swatchActive : ""}`}
              style={{ background: color }}
              onClick={() => {
                onSelect(color);
                setOpen(false);
              }}
            >
              {color === current && <Check size={10} strokeWidth={2} color="white" />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
