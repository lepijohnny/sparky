import { useStore } from "./index";

/**
 * Global keyboard shortcuts tied to store state.
 * Call once at app startup, returns cleanup function.
 */
export function initShortcuts(): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      useStore.getState().toggleFocusMode();
      return;
    }

    if (e.key !== "Escape") return;
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    const { isMulti, selectedChats, selectChat } = useStore.getState();
    if (!isMulti) return;

    e.preventDefault();
    const first = [...selectedChats.values()][0];
    selectChat(first ?? null);
  };

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
