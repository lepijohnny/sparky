import {
  Archive,
  ExternalLink,
  Flag,
  Pencil,
  Printer,
  Tag,
  Trash2,
} from "lucide-react";
import type { ContextMenuAction } from "../components/shared/ContextMenu";
import type { Chat } from "../types/chat";
import type { Label } from "../types/label";
import { buildLabelSubmenu } from "./labelActions";
import { mixColors } from "./themes";
import type { WsConnection } from "./ws";

interface ChatActionOptions {
  conn: WsConnection | null;
  chat: Chat;
  labels: Label[];
  onRename?: (chat: Chat) => void;
  onDelete?: (chat: Chat) => void;
  /** Override flag label (e.g. always "Unflag" for flagged page) */
  flagLabel?: string;
  /** Override archive label (e.g. "Unarchive" for archived page) */
  archiveLabel?: string;
  archiveValue?: boolean;
  /** WS port + token for opening in new window */
  wsPort?: number | null;
  sidecarToken?: string | null;
}

async function openChatWindow(chat: Chat, wsPort: number, sidecarToken: string) {
  if (!window.__TAURI_INTERNALS__) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const { Window, getCurrentWindow } = await import("@tauri-apps/api/window");
    const label = `chat-${chat.id}`;
    const existing = await Window.getByLabel(label);
    const current = getCurrentWindow();
    if (existing && existing.label !== current.label) {
      await existing.show();
      await existing.unminimize();
      await existing.setFocus();
      return;
    }
    const windowLabel = existing ? `chat-${chat.id}-${Date.now()}` : label;
    const saved = localStorage.getItem("sparky-theme");
    const theme = saved ? JSON.parse(saved) : {};
    const bg = theme.bg ?? "";
    const fg = theme.fg ?? "";
    const accent = theme.accent ?? "";
    const webview = new WebviewWindow(windowLabel, {
      url: `/?chat=${chat.id}&port=${wsPort}&token=${encodeURIComponent(sidecarToken)}&bg=${encodeURIComponent(bg)}&fg=${encodeURIComponent(fg)}&accent=${encodeURIComponent(accent)}`,
      title: chat.name,
      width: 900,
      height: 900,
      center: true,
      resizable: true,
      decorations: true,
      titleBarStyle: "overlay",
      hiddenTitle: true,
    });
    webview.once("tauri://error", (e) => {
      console.error("WebviewWindow error:", e);
    });
  } catch (err) {
    console.error("openChatWindow failed:", err);
  }
}

async function openPrintWindow(chat: Chat, wsPort: number, sidecarToken: string) {
  if (!window.__TAURI_INTERNALS__) return;
  try {
    const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    const saved = localStorage.getItem("sparky-theme");
    const theme = saved ? JSON.parse(saved) : {};
    const bg = theme.bg ?? "";
    const fg = theme.fg ?? "";
    const accent = theme.accent ?? "";
    new WebviewWindow(`print-${chat.id}-${Date.now()}`, {
      url: `/?chat=${chat.id}&port=${wsPort}&token=${encodeURIComponent(sidecarToken)}&print=1&bg=${encodeURIComponent(bg)}&fg=${encodeURIComponent(fg)}&accent=${encodeURIComponent(accent)}`,
      title: `Print — ${chat.name}`,
      width: 800,
      height: 900,
      center: true,
      resizable: true,
      decorations: true,
      titleBarStyle: "overlay",
      hiddenTitle: true,
    });
  } catch (err) {
    console.error("openPrintWindow failed:", err);
  }
}

export function buildChatActions({
  conn,
  chat,
  labels,
  onRename,
  onDelete,
  flagLabel,
  archiveLabel,
  archiveValue,
  wsPort,
  sidecarToken,
}: ChatActionOptions): ContextMenuAction[] {
  return [
    ...(wsPort && sidecarToken
      ? [
          {
            label: "Open in New Window",
            icon: <ExternalLink size={12} strokeWidth={1.5} />,
            onClick: () => openChatWindow(chat, wsPort, sidecarToken),
          },
          {
            label: "Print",
            icon: <Printer size={12} strokeWidth={1.5} />,
            onClick: () => openPrintWindow(chat, wsPort, sidecarToken),
          },
        ]
      : []),
    {
      label: flagLabel ?? (chat.flagged ? "Unflag" : "Flag"),
      icon: <Flag size={12} strokeWidth={1.5} />,
      onClick: () => conn?.request("chat.flag", { id: chat.id, flagged: !chat.flagged }),
    },
    {
      label: "Label",
      icon: <Tag size={12} strokeWidth={1.5} />,
      submenu: buildLabelSubmenu(conn, chat, labels),
    },
    {
      label: archiveLabel ?? (chat.archived ? "Unarchive" : "Archive"),
      icon: <Archive size={12} strokeWidth={1.5} />,
      onClick: () => conn?.request("chat.archive", {
        id: chat.id,
        archived: archiveValue ?? !chat.archived,
      }),
    },
    {
      label: "Rename",
      icon: <Pencil size={12} strokeWidth={1.5} />,
      onClick: () => onRename?.(chat),
    },
    {
      label: "Delete",
      icon: <Trash2 size={12} strokeWidth={1.5} />,
      danger: true,
      onClick: () => {
        conn?.request("chat.delete", { id: chat.id });
        onDelete?.(chat);
      },
    },
  ];
}
