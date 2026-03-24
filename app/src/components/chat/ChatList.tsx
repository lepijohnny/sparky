import {
  ChevronRight,
  Flag,
  MoreHorizontal,
  Search,

  X,
} from "lucide-react";
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useConnection } from "../../context/ConnectionContext";
import { useStore } from "../../store";
import { useListSelection } from "../../hooks/useListSelection";
import { withAlpha } from "../../lib/color";
import { groupByDate } from "../../lib/dateGroups";
import type { Chat } from "../../types/chat";
import ContextMenu, { type ContextMenuAction } from "../shared/ContextMenu";
import { Blocks } from "lucide-react";
import { getProviderIcon } from "../../lib/providerIcons";
import styles from "./ChatList.module.css";

interface SearchResult {
  chat: Chat;
  matchCount: number;
}

// Simple date formatter cache — avoids creating Date + toLocaleDateString per item per render
const dateCache = new Map<string, string>();
function formatDate(iso: string): string {
  let cached = dateCache.get(iso);
  if (!cached) {
    cached = new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    dateCache.set(iso, cached);
    // Keep cache bounded
    if (dateCache.size > 500) {
      const first = dateCache.keys().next().value!;
      dateCache.delete(first);
    }
  }
  return cached;
}

interface ChatListProps {
  selectedChatId: string | null;
  multiSelectedIds?: Set<string>;
  onSelectChat: (chat: Chat) => void;
  onToggleSelect?: (chat: Chat) => void;
  onRangeSelect?: (chat: Chat, allChats: Chat[]) => void;
  onSelectAll?: (chats: Chat[]) => void;
  actions: (chat: Chat) => ContextMenuAction[];
  emptyIcon: ReactNode;
  emptyMessage: string;
  searching: boolean;
  onSearchClose: () => void;
  onSearchQueryChange?: (query: string) => void;
  searchFilter?: { flagged?: boolean; archived?: boolean; labelId?: string };
  filter?: (chat: Chat) => boolean;
}

export default memo(function ChatList({
  selectedChatId,
  multiSelectedIds,
  onSelectChat,
  onToggleSelect,
  onRangeSelect,
  onSelectAll,
  actions,
  emptyIcon,
  emptyMessage,
  searching,
  onSearchClose,
  onSearchQueryChange,
  searchFilter,
  filter,
}: ChatListProps) {
  const { conn } = useConnection();
  const allChats = useStore((s) => s.chats);
  const labels = useStore((s) => s.labels);
  const streamingChats = useStore((s) => s.streamingChatIds);
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const chats = useMemo(() => filter ? allChats.filter(filter) : allChats, [allChats, filter]);
  const loading = allChats.length === 0;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (searching) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
      setResults(null);
    }
  }, [searching]);

  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!val.trim()) {
      setResults(null);
      onSearchQueryChange?.("");
      return;
    }

    debounceRef.current = setTimeout(async () => {
      if (!conn) return;
      try {
        const trimmed = val.trim();
        const res = await conn.request<{ results: SearchResult[] }>("chat.search", {
          query: trimmed,
          ...searchFilter,
        });
        setResults(res.results);
        onSearchQueryChange?.(trimmed);
      } catch {
        setResults([]);
      }
    }, 300);
  }, [conn, searchFilter, onSearchQueryChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") onSearchClose();
  }, [onSearchClose]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const displayChats = results !== null ? results.map((r) => r.chat) : chats;

  const selection = useListSelection(
    chats,
    selectedChatId,
    multiSelectedIds,
    { onSelect: onSelectChat, onToggle: onToggleSelect ?? onSelectChat, onRange: onRangeSelect ?? ((c) => onSelectChat(c)), onSelectAll: onSelectAll ?? (() => {}) },
  );
  const matchCountMap = results !== null
    ? new Map(results.map((r) => [r.chat.id, r.matchCount]))
    : null;

  const groups = useMemo(
    () => results === null ? groupByDate(displayChats, (c) => c.updatedAt) : [],
    [displayChats, results],
  );

  const collapsed = useStore((s) => s.collapsedGroups);
  const toggleCollapsed = useStore((s) => s.toggleCollapsedGroup);

  const isEmpty = !loading && displayChats.length === 0 && !searching;
  const noResults = searching && results !== null && results.length === 0 && query.trim();

  const renderChatItem = (chat: Chat) => (
    <div
      key={chat.id}
      className={`${styles.item} ${selection.isSelected(chat.id) ? styles.itemActive : ""}`}
      onMouseDown={selection.handleMouseDown}
      onClick={(e) => selection.handleClick(e, chat, displayChats)}
    >
      {matchCountMap?.has(chat.id) && (
        <span className={styles.matchBadge}>
          {matchCountMap.get(chat.id)}
        </span>
      )}
      <div className={styles.itemContent}>
        <span className={`${styles.itemName} ${chat.role && chat.role !== "sparky" ? styles.itemNameSystem : ""}`}>{chat.name.length > 40 ? chat.name.slice(0, 40) + "…" : chat.name}</span>
        <div className={styles.itemMeta}>
          {(!chat.role || chat.role === "sparky") && streamingChats.has(chat.id) && <div className={styles.streamingLine} />}
          {chat.role === "connection" && <Blocks size={10} strokeWidth={1.5} className={styles.metaIcon} />}
          {chat.provider && <span className={styles.metaIcon}>{getProviderIcon(chat.provider, 10)}</span>}
          {chat.flagged && <Flag size={10} strokeWidth={1.5} fill="currentColor" className={styles.flagIcon} />}
          {chat.labels && chat.labels.length > 0 && (
            <div className={styles.labelBadges}>
              {chat.labels.map((id) => {
                const label = labelMap.get(id);
                if (!label) return null;
                return (
                  <span
                    key={id}
                    className={styles.labelBadge}
                    style={{
                      color: label.color,
                      background: withAlpha(label.color, 0.15),
                    }}
                  >
                    {label.name}
                  </span>
                );
              })}
            </div>
          )}
          <span className={styles.itemDate}>
            {formatDate(chat.updatedAt)}
          </span>
        </div>
      </div>
      <div className={styles.moreBtn} onClick={(e) => e.stopPropagation()}>
        <ContextMenu actions={actions(chat)}>
          <MoreHorizontal size={14} strokeWidth={1.5} />
        </ContextMenu>
      </div>
    </div>
  );

  return (
    <div className={styles.container}>
      {searching && (
        <div className={styles.searchBar}>
          <Search size={13} strokeWidth={1.5} className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.searchInput}
            placeholder="Search messages..."
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleKeyDown}
          />
          <button className={styles.searchClose} onClick={onSearchClose}>
            <X size={13} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className={styles.empty}>
          {emptyIcon}
          <span>{emptyMessage}</span>
        </div>
      ) : noResults ? (
        <div className={styles.empty}>
          <Search size={20} strokeWidth={1.2} />
          <span>No matches</span>
        </div>
      ) : (
        <div className={styles.list}>
          {results !== null
            ? displayChats.map((chat) => renderChatItem(chat))
            : groups.map((group) => (
                <div key={group.label}>
                  <div className={styles.dateDivider} onClick={() => toggleCollapsed(group.label)}>
                    <ChevronRight size={12} strokeWidth={1.5} className={`${styles.chevron} ${collapsed.has(group.label) ? "" : styles.chevronOpen}`} />
                    {group.label}
                  </div>
                  {!collapsed.has(group.label) && group.items.map((chat) => renderChatItem(chat))}
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
});
