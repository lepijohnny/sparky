import {
  Archive,
  Flag,
  MessageSquare,
  Tag,
} from "lucide-react";
import { type ReactNode, useCallback, useRef } from "react";
import ChatList from "../../components/chat/ChatList";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import { buildChatActions } from "../../lib/chatActions";
import type { Chat } from "../../types/chat";

export interface ChatListPageConfig {
  emptyIcon: ReactNode;
  emptyMessage: string;
  actionOverrides?: Partial<Parameters<typeof buildChatActions>[0]>;
  searchFilter?: { flagged?: boolean; archived?: boolean; labelId?: string };
  filter?: (chat: Chat) => boolean;
}

interface ChatListPageProps {
  config: ChatListPageConfig;
  selectedChatId: string | null;
  multiSelectedIds?: Set<string>;
  onSelectChat: (chat: Chat) => void;
  onToggleSelect?: (chat: Chat) => void;
  onRangeSelect?: (chat: Chat, allChats: Chat[]) => void;
  onSelectAll?: (chats: Chat[]) => void;
  onRenameChat?: (chat: Chat) => void;
  searching: boolean;
  onSearchClose: () => void;
  onSearchQueryChange?: (query: string) => void;
}

export default function ChatListPage({
  config,
  selectedChatId,
  multiSelectedIds,
  onSelectChat,
  onToggleSelect,
  onRangeSelect,
  onSelectAll,
  onRenameChat,
  searching,
  onSearchClose,
  onSearchQueryChange,
}: ChatListPageProps) {
  const { conn, wsPort, sidecarToken } = useConnection();
  const labels = useStore((s) => s.labels);

  // Keep a ref so the actions callback is stable and doesn't bust
  // ChatList's memo on every labels/conn change.
  const depsRef = useRef({ conn, labels, onRenameChat, wsPort, sidecarToken, actionOverrides: config.actionOverrides });
  depsRef.current = { conn, labels, onRenameChat, wsPort, sidecarToken, actionOverrides: config.actionOverrides };

  const actions = useCallback((chat: Chat) => {
    const d = depsRef.current;
    return buildChatActions({
      conn: d.conn,
      chat,
      labels: d.labels,
      onRename: d.onRenameChat,
      wsPort: d.wsPort,
      sidecarToken: d.sidecarToken,
      ...d.actionOverrides,
    });
  }, []);

  return (
    <ChatList
      selectedChatId={selectedChatId}
      multiSelectedIds={multiSelectedIds}
      onSelectChat={onSelectChat}
      onToggleSelect={onToggleSelect}
      onRangeSelect={onRangeSelect}
      onSelectAll={onSelectAll}
      emptyIcon={config.emptyIcon}
      emptyMessage={config.emptyMessage}
      actions={actions}
      searching={searching}
      onSearchClose={onSearchClose}
      onSearchQueryChange={onSearchQueryChange}
      searchFilter={config.searchFilter}
      filter={config.filter}
    />
  );
}

export const CHAT_CONFIG: ChatListPageConfig = {
  emptyIcon: <MessageSquare size={20} strokeWidth={1.2} />,
  emptyMessage: "No chats yet",
  actionOverrides: { archiveValue: true },
  filter: (c) => !c.archived,
};

export const FLAGGED_CONFIG: ChatListPageConfig = {
  emptyIcon: <Flag size={20} strokeWidth={1.2} />,
  emptyMessage: "No flagged chats",
  actionOverrides: { flagLabel: "Unflag", archiveValue: true },
  searchFilter: { flagged: true },
  filter: (c) => !!c.flagged && !c.archived,
};

export const ARCHIVED_CONFIG: ChatListPageConfig = {
  emptyIcon: <Archive size={20} strokeWidth={1.2} />,
  emptyMessage: "No archived chats",
  actionOverrides: { archiveLabel: "Unarchive", archiveValue: false },
  searchFilter: { archived: true },
  filter: (c) => !!c.archived,
};

export function labelsConfig(labelId: string | null): ChatListPageConfig {
  return {
    emptyIcon: <Tag size={20} strokeWidth={1.2} />,
    emptyMessage: labelId ? "No chats with this label" : "No labeled chats",
    actionOverrides: { archiveValue: true },
    searchFilter: labelId ? { labelId } : undefined,
    filter: labelId
      ? (c) => !c.archived && !!c.labels?.includes(labelId)
      : (c) => !c.archived && !!c.labels?.length,
  };
}
