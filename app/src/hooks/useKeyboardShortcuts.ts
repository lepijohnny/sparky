import { useEffect } from "react";
import { useStore } from "../store";
import type { Section } from "../store/types";

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

const SECTIONS: Section[] = ["chats", "sources", "connections", "settings"];

interface ShortcutActions {
  onNewChat: () => void;
  onDeleteChat: () => void;
  onPrintChat: () => void;
  onSearch: () => void;
}

export function useKeyboardShortcuts(actions: ShortcutActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (!mod) return;

      const tag = (e.target as HTMLElement)?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable;

      const key = e.key.toLowerCase();
      let handled = true;

      if (key === "n") actions.onNewChat();
      else if (key === "k") actions.onSearch();
      else if (key === "backspace" && !isInput) actions.onDeleteChat();
      else if (key === "b") useStore.getState().toggleFocusMode();
      else if (key === "l") document.querySelector<HTMLElement>("[data-shortcut-input]")?.focus();
      else if (key === "p") actions.onPrintChat();
      else {
        const num = parseInt(e.key);
        if (num >= 1 && num <= SECTIONS.length) useStore.getState().setSection(SECTIONS[num - 1]);
        else handled = false;
      }

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [actions]);
}


