import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import styles from "./InputPopover.module.css";

export interface PopoverItem {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  checked?: boolean;
}

interface InputPopoverProps {
  items: PopoverItem[];
  position: { x: number; y: number };
  filter: string;
  emptyLabel: string;
  onSelect: (item: PopoverItem) => void;
  onClose: () => void;
  onRight?: (item: PopoverItem) => void;
  onLeft?: () => void;
}

export default memo(function InputPopover({
  items,
  position,
  filter,
  emptyLabel,
  onSelect,
  onClose,
  onRight,
  onLeft,
}: InputPopoverProps) {
  const [activeIdx, setActiveIdx] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = items.filter((item) =>
    item.name.toLowerCase().includes(filter.toLowerCase()),
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [filter, items]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (filtered[activeIdx]) onSelect(filtered[activeIdx]);
    } else if (e.key === "ArrowRight" && onRight) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (filtered[activeIdx]) onRight(filtered[activeIdx]);
    } else if (e.key === "ArrowLeft" && onLeft) {
      e.preventDefault();
      e.stopImmediatePropagation();
      onLeft();
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (filtered[activeIdx]) onSelect(filtered[activeIdx]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }, [filtered, activeIdx, onSelect, onClose]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <div
      ref={listRef}
      className={styles.popover}
      style={{ left: position.x, top: position.y, transform: "translateY(-100%)" }}
    >
      {filtered.length === 0 ? (
        <div className={styles.empty}>{emptyLabel}</div>
      ) : (
        filtered.map((item, i) => (
          <div
            key={item.id}
            className={`${styles.item} ${i === activeIdx ? styles.itemActive : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
            onMouseEnter={() => setActiveIdx(i)}
          >
            {item.icon && (
              <img src={item.icon} alt="" className={styles.itemIcon} />
            )}
            {item.color && !item.icon && (
              <span className={styles.itemDot} style={{ background: item.color }} />
            )}
            <span className={styles.itemName}>{item.name}</span>
            {item.checked && <Check size={10} strokeWidth={2} className={styles.itemCheck} />}
          </div>
        ))
      )}
    </div>
  );
});
