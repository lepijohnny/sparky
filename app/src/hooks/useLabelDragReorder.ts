import { useCallback, useRef, useState } from "react";

export interface DragReorder<T> {
  /** Current list order (live during drag) */
  items: T[];
  /** Index currently being dragged, or null */
  dragIndex: number | null;
  /** Props to spread on the grip handle element */
  gripProps: (index: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
}

/**
 * Drag-to-reorder for the label list in the sidebar menu.
 *
 * Manages pointer-event-based drag tracking so labels can be
 * reordered by grabbing a grip handle. Keeps local order optimistic
 * after a drop (doesn't revert until the server pushes new data).
 *
 * The drag snapshot is always taken from the current rendered `items`
 * (via a ref) so the splice indices match the DOM `data-drag-idx`
 * attributes, even if `sourceItems` and local state have diverged.
 */
export function useLabelDragReorder<T>(
  sourceItems: T[],
  onReorder: (reordered: T[]) => void,
): DragReorder<T> {
  const [items, setItems] = useState<T[]>(sourceItems);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lastSourceRef = useRef(sourceItems);

  // Sync from source when the server pushes new data,
  // but not while a drag is in progress.
  if (dragIndex === null && sourceItems !== lastSourceRef.current) {
    lastSourceRef.current = sourceItems;
    setItems(sourceItems);
  }

  const gripProps = useCallback((index: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      const snapshot = [...itemsRef.current];
      const startIdx = index;
      let currentIdx = index;
      setDragIndex(index);

      const handleMove = (ev: PointerEvent) => {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const row = el?.closest("[data-drag-idx]") as HTMLElement | null;
        if (!row) return;
        const toIdx = Number(row.dataset.dragIdx);
        if (toIdx === currentIdx || Number.isNaN(toIdx)) return;

        const next = [...snapshot];
        const [moved] = next.splice(startIdx, 1);
        next.splice(toIdx, 0, moved);
        setItems(next);
        currentIdx = toIdx;
        setDragIndex(toIdx);
      };

      const handleUp = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
        setDragIndex(null);
        setItems((current) => {
          onReorder(current);
          return current;
        });
      };

      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
    },
    style: { cursor: "grab", touchAction: "none" as const } as React.CSSProperties,
  }), [onReorder]);

  return { items, dragIndex, gripProps };
}
