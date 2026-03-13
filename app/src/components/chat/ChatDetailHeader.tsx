import { ChevronDown } from "lucide-react";
import { memo, useMemo } from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import { buildChatActions } from "../../lib/chatActions";
import type { Chat } from "../../types/chat";
import ContextMenu from "../shared/ContextMenu";

interface ChatDetailHeaderProps {
  chat: Chat;
  onRename: (chat: Chat) => void;
  onDelete: (chat: Chat) => void;
}

export default memo(function ChatDetailHeader({ chat, onRename, onDelete }: ChatDetailHeaderProps) {
  const { conn, wsPort, sidecarToken } = useConnection();
  const labels = useStore((s) => s.labels);

  const actions = useMemo(() => buildChatActions({
    conn,
    chat,
    labels,
    onRename,
    onDelete,
    wsPort,
    sidecarToken,
  }), [conn, chat, labels, onRename, onDelete, wsPort, sidecarToken]);

  return (
    <ContextMenu actions={actions}>
      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, color: "var(--fg)" }}>
        {chat.name}
        <ChevronDown size={14} strokeWidth={1.5} style={{ color: "var(--fg-muted)" }} />
      </span>
    </ContextMenu>
  );
});
