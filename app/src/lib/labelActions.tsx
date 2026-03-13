import { Check, CircleOff } from "lucide-react";
import type { ContextMenuAction } from "../components/shared/ContextMenu";
import type { Chat } from "../types/chat";
import type { Label } from "../types/label";
import type { WsConnection } from "./ws";

export function buildLabelSubmenu(
  conn: WsConnection | null,
  chat: Chat,
  labels: Label[],
): ContextMenuAction[] {
  if (labels.length === 0) {
    return [{
      label: "No labels",
      icon: <CircleOff size={12} strokeWidth={1.5} />,
      disabled: true,
    }];
  }
  const assigned = new Set(chat.labels ?? []);
  return labels.map((label) => {
    const isAssigned = assigned.has(label.id);
    return {
      label: label.name,
      icon: (
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: label.color,
            flexShrink: 0,
          }}
        />
      ),
      onClick: () => {
        const next = isAssigned
          ? [...assigned].filter((id) => id !== label.id)
          : [...assigned, label.id];
        conn?.request("chat.label", { id: chat.id, labels: next });
      },
      suffix: isAssigned ? <Check size={10} strokeWidth={2} /> : undefined,
    };
  });
}
