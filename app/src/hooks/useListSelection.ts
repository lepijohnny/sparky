import { useEffect } from "react";

interface Identifiable { id: string }

interface ListSelectionActions<T extends Identifiable> {
  onSelect: (item: T) => void;
  onToggle: (item: T) => void;
  onRange: (item: T, all: T[]) => void;
  onSelectAll: (all: T[]) => void;
}

interface ListSelectionResult<T extends Identifiable> {
  handleClick: (e: React.MouseEvent, item: T, allItems: T[]) => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  isSelected: (id: string) => boolean;
}

/**
 * Shared list selection behavior — click, ⌘+click, shift+click, ⌘+A.
 */
export function useListSelection<T extends Identifiable>(
  items: T[],
  selectedId: string | null | undefined,
  multiSelectedIds: Set<string> | undefined,
  actions: ListSelectionActions<T>,
): ListSelectionResult<T> {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && items.length > 0) {
        const el = e.target as HTMLElement;
        if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return;
        e.preventDefault();
        actions.onSelectAll(items);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [items, actions.onSelectAll]);

  const handleClick = (e: React.MouseEvent, item: T, allItems: T[]) => {
    if (e.shiftKey) {
      actions.onRange(item, allItems);
    } else if (e.metaKey || e.ctrlKey) {
      actions.onToggle(item);
    } else {
      actions.onSelect(item);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) e.preventDefault();
  };

  const isSelected = (id: string) =>
    multiSelectedIds?.has(id) ?? selectedId === id;

  return { handleClick, handleMouseDown, isSelected };
}
