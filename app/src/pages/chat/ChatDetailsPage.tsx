import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import { Eye, Paperclip, Pin } from "lucide-react";
import { open as shellOpen } from "@tauri-apps/plugin-shell";
import AgentMessageBubble from "../../components/chat/AgentMessageBubble";
import AnchorTray from "../../components/chat/AnchorTray";
import AgentTurnInput from "../../components/chat/AgentTurnInput";
import ErrorBoundary from "../../components/shared/ErrorBoundary";

import { useConnection } from "../../context/ConnectionContext";
import { useAgentReplyStream } from "../../hooks/useAgentReplyStream";
import { useWsRequest } from "../../hooks/useWsRequest";
import { useWsSubscriber } from "../../hooks/useWsSubscriber";
import { collapseEntries, type Message } from "../../lib/chatUtils";
import type { Chat, ChatActivity, ChatEntry } from "../../types/chat";
import { highlightText } from "../../lib/highlight";
import { useStore } from "../../store";
import { resolveServiceMentions, resolveSkillMentions } from "../../lib/serviceResolver";
import styles from "./ChatDetailsPage.module.css";


const UserBubble = memo(function UserBubble({ message, searchQuery, onToggleAnchor }: { message: Message; searchQuery?: string; onToggleAnchor?: (rowid: number, anchored: boolean) => void }) {
  return (
    <div className={`${styles.message} ${styles.messageUser}`}>
      <div className={styles.bubbleWrapUser}>
        {message.attachments && message.attachments.length > 0 && (
          <div className={styles.userAttachments}>
            {message.attachments.map((att, i) => {
              const thumb = att.thumbnailUrl || att.thumbnailDataUrl;
              return (
                <div
                  key={att.id ?? i}
                  className={styles.userAttachThumb}
                  title={att.filename}
                  style={{ cursor: att.filePath ? "pointer" : undefined }}
                  onClick={() => { if (att.filePath) shellOpen(att.filePath).catch(() => {}); }}
                >
                  {thumb ? (
                    <img src={thumb} alt={att.filename} className={styles.userAttachImg} />
                  ) : (
                    <div className={styles.userAttachIcon}>
                      <Paperclip size={14} strokeWidth={1.5} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className={`${styles.bubble} ${styles.bubbleUser}`} data-bubble>
          {highlightText(message.content, searchQuery)}
        </div>
        {message.rowid != null && onToggleAnchor && (
          <button
            className={`${styles.anchorBtn} ${message.anchored ? styles.anchorBtnActive : ""}`}
            onClick={() => onToggleAnchor(message.rowid!, !message.anchored)}
            title={message.anchored ? "Unpin from context" : "Pin to context"}
          >
            <Pin size={12} strokeWidth={1.5} />
          </button>
        )}
      </div>
    </div>
  );
});

interface ChatDetailsPageProps {
  chat: Chat;
  searchQuery?: string;
}

const modelCache = new Map<string, { provider: string; model: string; label: string; supportsThinking: boolean }>();

export default function ChatDetailsPage({ chat, searchQuery }: ChatDetailsPageProps) {
  const { conn } = useConnection();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadingMoreRef = useRef(false);



  const [modelGeneration, setModelGeneration] = useState(0);
  const modelKey = `${chat.provider}:${chat.model}`;
  const cached = modelCache.get(modelKey) ?? null;
  const { data: resolved } = useWsRequest<{ provider: string; model: string; label: string; supportsThinking: boolean; contextWindow?: number; supportsAttachments?: string[] }>(
    conn, "core.registry.model", { provider: chat.provider, model: chat.model }, [chat.provider, chat.model, modelGeneration],
  );
  if (resolved) modelCache.set(modelKey, resolved);
  const model = resolved ?? cached;
  const lastModelRef = useRef(model);
  if (model) lastModelRef.current = model;
  const effectiveModel = model ?? lastModelRef.current;
  const chatProvider = effectiveModel?.provider ?? chat.provider ?? "";
  const chatModel = effectiveModel?.model ?? chat.model ?? "";
  const supportsThinking = effectiveModel?.supportsThinking ?? false;

  useWsSubscriber(conn, "core.models.ready", useCallback(() => {
    setModelGeneration((g) => g + 1);
  }, []));

  const onStreamEntry = useCallback((entry: ChatEntry) => {
    if (entry.kind === "message") {
      if (entry.role === "user" && optimisticIdRef.current) {
        const oid = optimisticIdRef.current;
        optimisticIdRef.current = null;
        if (pendingAttachmentsRef.current) {
          entry = { ...entry, attachments: pendingAttachmentsRef.current };
          pendingAttachmentsRef.current = null;
        }
        setEntries((prev) => prev.map((e) => e.kind === "message" && e.id === oid ? entry : e));
      } else if (entry.role === "user") {
        const updatedEntry = entry;
        setEntries((prev) => {
          const exists = prev.some((e) => e.kind === "message" && e.id === updatedEntry.id);
          if (exists) return prev.map((e) => e.kind === "message" && e.id === updatedEntry.id ? updatedEntry : e);
          return [...prev, updatedEntry];
        });
      } else {
        setEntries((prev) => [...prev, entry]);
      }
      if (entry.role === "user") {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });

      }
      if (entry.role === "assistant") {
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        });
      }
    } else if (
      entry.kind === "activity" &&
      (entry.type === "agent.done" || entry.type === "agent.stopped" || entry.type === "agent.error")
    ) {
      setEntries((prev) => [...prev, entry]);
    }
  }, []);

  const connRef = useRef(conn);
  connRef.current = conn;
  const chatIdRef = useRef(chat.id);
  chatIdRef.current = chat.id;

  const onStreamEnd = useCallback(() => {
    setEntries((prev) => {
      const lastUser = [...prev].reverse().find(
        (e) => e.kind === "message" && e.role === "user",
      );
      if (!lastUser || lastUser.kind !== "message") return prev;

      const existingActivityTypes = new Set(
        prev.filter((e) => e.kind === "activity" && e.messageId === lastUser.id)
          .map((e) => `${(e as ChatActivity).type}-${(e as ChatActivity).timestamp}`),
      );

      const newActivities = streamRef.current.filter(
        (a) => !existingActivityTypes.has(`${a.type}-${a.timestamp}`),
      );

      if (newActivities.length === 0) return prev;
      const terminalIdx = prev.findLastIndex(
        (e) => e.kind === "activity" &&
          (e.type === "agent.done" || e.type === "agent.stopped" || e.type === "agent.error") &&
          e.messageId === lastUser.id,
      );
      if (terminalIdx === -1) return [...prev, ...newActivities];
      const next = [...prev];
      next.splice(terminalIdx, 0, ...newActivities);
      return next;
    });

    connRef.current?.request("chat.entries", { chatId: chatIdRef.current })
      .then((data: any) => { if (data?.entries) setEntries(data.entries); })
      .catch(() => {});
  }, []);

  const stream = useAgentReplyStream(conn, chat.id, onStreamEntry, onStreamEnd);

  const streamRef = useRef(stream.activities);
  streamRef.current = stream.activities;

  const allMessages = useMemo(() => collapseEntries(entries), [entries]);
  const [renderAll, setRenderAll] = useState(false);
  useEffect(() => {
    setRenderAll(false);
    const id = requestAnimationFrame(() => setRenderAll(true));
    return () => cancelAnimationFrame(id);
  }, [chat.id]);
  const messages = renderAll ? allMessages : allMessages.slice(-10);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);
  useLayoutEffect(() => {
    const pending = pendingScrollRef.current;
    if (!pending || !scrollRef.current) return;
    pendingScrollRef.current = null;
    const container = scrollRef.current;
    container.scrollTop = pending.scrollTop + (container.scrollHeight - pending.scrollHeight);
  }, [entries]);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const hasMoreRef = useRef(hasMore);
  const entriesRef = useRef(entries);
  hasMoreRef.current = hasMore;
  entriesRef.current = entries;

  const loadOlder = useCallback(() => {
    if (!hasMoreRef.current || loadingMoreRef.current || !conn || !scrollRef.current) return;
    const firstRowid = entriesRef.current.find((e) => e.rowid !== undefined)?.rowid;
    if (firstRowid === undefined) return;

    loadingMoreRef.current = true;
    const container = scrollRef.current;

    (conn.request("chat.entries", { chatId: chat.id, before: firstRowid }) as Promise<{ entries: ChatEntry[]; hasMore: boolean }>)
      .then((data) => {
        if (data.entries.length === 0) {
          setHasMore(false);
          return;
        }
        pendingScrollRef.current = { scrollTop: container.scrollTop, scrollHeight: container.scrollHeight };
        setEntries((prev) => [...data.entries, ...prev]);
        setHasMore(data.hasMore);
      })
      .catch((err) => console.error("Failed to load older entries:", err))
      .finally(() => { loadingMoreRef.current = false; });
  }, [conn, chat.id]);

  const readyRef = useRef(ready);
  readyRef.current = ready;

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distFromBottom < 80;
    setIsNearBottom(near);
    if (readyRef.current && el.scrollTop < 800) loadOlder();
  }, [loadOlder]);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useLayoutEffect(() => {
    if (!stream.active && isNearBottom) scrollToBottom();
  }, [messages]);

  const innerRef = useRef<HTMLDivElement>(null);

  const streamActiveRef = useRef(stream.active);
  streamActiveRef.current = stream.active;

  useEffect(() => {
    const container = scrollRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;

    let wasNearBottom = true;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      wasNearBottom = dist < 150;
    };

    container.addEventListener("scroll", onScroll, { passive: true });

    const observer = new ResizeObserver(() => {
      if (wasNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    });

    observer.observe(inner);
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", onScroll);
    };
  }, [ready]);

  const { data: loaded } = useWsRequest<{ chat: Chat; entries: ChatEntry[]; hasMore: boolean; streaming: boolean; partialContent: string | null }>(
    conn, "chat.get.id", { id: chat.id }, [chat.id],
  );

  useEffect(() => {
    if (!loaded) return;
    setEntries(loaded.entries);
    setHasMore(loaded.hasMore);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom();
        setReady(true);
      });
    });
    if (loaded.streaming) {
      const lastUser = [...loaded.entries].reverse().find(
        (e) => e.kind === "message" && e.role === "user",
      );
      if (lastUser && lastUser.kind === "message") {
        const turnActivities = loaded.entries.filter(
          (e): e is ChatActivity => e.kind === "activity" && e.messageId === lastUser.id,
        );
        stream.setActive(true, turnActivities, loaded.partialContent ?? undefined);
      } else {
        stream.setActive(true, undefined, loaded.partialContent ?? undefined);
      }
    }
    if (loaded.hasMore && conn) {
      conn.request("chat.entries", { chatId: loaded.chat.id })
        .then((data: any) => {
          if (data?.entries) {
            setEntries(data.entries);
            setHasMore(false);
          }
        })
        .catch(() => {});
    }
  }, [loaded]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.style.overflow = "";
    setReady(false);
    setEntries([]);
    setHasMore(false);
    setIsNearBottom(true);
    loadingMoreRef.current = false;
  }, [chat.id]);

  const handleModelChange = useCallback(async (provider: string, model: string) => {
    if (!conn) return;
    try {
      const res = await conn.request<{ chat: Chat }>("chat.model", { id: chatIdRef.current, provider, model });
      useStore.getState().patchChat(res.chat);
    } catch (err) {
      console.error("Failed to set chat model:", err);
    }
  }, [conn]);

  const anchoredEntries = useMemo(
    () => entries.filter((e): e is import("../../types/chat").ChatMessage => e.kind === "message" && !!e.anchored),
    [entries],
  );

  const handleToggleAnchor = useCallback(async (rowid: number, anchored: boolean) => {
    if (!conn) return;
    setEntries((prev) => prev.map((e) =>
      e.kind === "message" && e.rowid === rowid ? { ...e, anchored } : e
    ));
    conn.request(anchored ? "chat.anchor.add" : "chat.anchor.remove", { chatId: chat.id, rowid })
      .catch(() => {});
  }, [conn, chat.id]);

  const handleAnchorRename = useCallback((rowid: number, name: string) => {
    if (!conn) return;
    setEntries((prev) => prev.map((e) =>
      e.kind === "message" && e.rowid === rowid ? { ...e, anchorName: name || undefined } : e
    ));
    conn.request("chat.anchor.rename", { chatId: chat.id, rowid, name })
      .catch(() => {});
  }, [conn, chat.id]);

  const handleAnchorJump = useCallback((rowid: number) => {
    const el = scrollRef.current;
    if (!el || !conn) return;

    const flash = (wrapper: HTMLElement) => {
      const bubble = wrapper.querySelector("[data-bubble]") as HTMLElement | null;
      if (bubble) {
        bubble.classList.remove(styles.anchorFlash);
        void bubble.offsetWidth;
        bubble.classList.add(styles.anchorFlash);
      }
    };

    const isVisible = (wrapper: HTMLElement) => {
      const containerRect = el.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      return wrapperRect.top < containerRect.bottom && wrapperRect.bottom > containerRect.top;
    };

    const jump = () => {
      const wrapper = el.querySelector(`[data-rowid="${rowid}"]`) as HTMLElement | null;
      if (!wrapper) return;
      if (isVisible(wrapper)) {
        flash(wrapper);
      } else {
        wrapper.scrollIntoView({ behavior: "instant", block: "center" });
        flash(wrapper);
      }
    };

    if (el.querySelector(`[data-rowid="${rowid}"]`)) {
      jump();
      return;
    }

    const loadUntilFound = async () => {
      const MAX_PAGES = 50;
      for (let page = 0; page < MAX_PAGES; page++) {
        const current = entriesRef.current;
        const cursor = current.find((e) => e.rowid !== undefined)?.rowid;
        if (cursor === undefined) break;

        let data: { entries: ChatEntry[]; hasMore: boolean };
        try {
          data = await (conn.request("chat.entries", { chatId: chat.id, before: cursor }) as Promise<{ entries: ChatEntry[]; hasMore: boolean }>);
        } catch {
          break;
        }
        if (data.entries.length === 0) break;

        const prevScrollTop = el.scrollTop;
        const prevScrollHeight = el.scrollHeight;
        el.style.overflow = "hidden";
        try {
          flushSync(() => {
            setEntries((prev) => {
              const existing = new Set(prev.map((e) => e.rowid).filter(Boolean));
              const fresh = data.entries.filter((e) => !existing.has(e.rowid));
              return [...fresh, ...prev];
            });
            setHasMore(data.hasMore);
          });
          el.scrollTop = prevScrollTop + (el.scrollHeight - prevScrollHeight);
        } finally {
          el.style.overflow = "";
        }

        if (el.querySelector(`[data-rowid="${rowid}"]`)) {
          jump();
          return;
        }

        if (!data.hasMore) break;
      }
    };
    loadUntilFound();
  }, [conn, chat.id]);

  const pendingAttachmentsRef = useRef<import("../../types/chat").MessageAttachment[] | null>(null);
  const optimisticIdRef = useRef<string | null>(null);

  const handleSend = useCallback(async (text: string, attachments: import("../../types/attachment").PendingAttachment[], knowledgeFilters?: string[]) => {
    if (!conn) return;
    scrollToBottom();

    const isSteering = streamActiveRef.current;

    if (isSteering) {
      setEntries((prev) => {
        const lastIdx = prev.findLastIndex((e) => e.kind === "message" && e.role === "user");
        if (lastIdx === -1) return prev;
        const last = prev[lastIdx];
        if (last.kind !== "message") return prev;
        const updated = { ...last, content: last.content + "\n" + text };
        return [...prev.slice(0, lastIdx), updated, ...prev.slice(lastIdx + 1)];
      });

      try {
        await conn.request("chat.ask", {
          chatId: chat.id,
          content: text,
        });
      } catch (err) {
        console.error("Failed to send steering message:", err);
      }
      return;
    }

    const atts = attachments.length > 0
      ? attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, thumbnailUrl: a.thumbnailUrl ?? undefined, filePath: a.filePath }))
      : undefined;
    if (atts) pendingAttachmentsRef.current = atts;

    const optimisticId = `optimistic-${Date.now()}`;
    optimisticIdRef.current = optimisticId;
    setEntries((prev) => [...prev, {
      kind: "message" as const,
      id: optimisticId,
      role: "user" as const,
      content: text,
      timestamp: new Date().toISOString(),
      attachments: atts,
    }]);

    try {
      const attachmentIds: string[] = [];
      for (const att of attachments) {
        if (!att.filePath) continue;
        let thumbnail: string | undefined;
        if (att.thumbnailUrl) {
          try {
            const resp = await fetch(att.thumbnailUrl);
            const blob = await resp.blob();
            const buf = await blob.arrayBuffer();
            thumbnail = btoa(String.fromCharCode(...new Uint8Array(buf)));
          } catch {}
        }
        const res = await conn.request<{ attachment: { id: string } }>(
          "chat.attachment.add",
          { chatId: chat.id, filePath: att.filePath, mimeType: att.mimeType, thumbnail },
        );
        attachmentIds.push(res.attachment.id);
      }

      const store = useStore.getState();
      const services = resolveServiceMentions(text, store.connections);
      const skills = resolveSkillMentions(text, store.skills);
      await conn.request("chat.ask", {
        chatId: chat.id,
        content: text,
        attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined,
        services: services.length > 0 ? services : undefined,
        skills: skills.length > 0 ? skills : undefined,
        knowledgeFilters,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  }, [conn, chat.id, scrollToBottom]);

  const handleStop = useCallback(() => {
    conn?.request("chat.stop", { chatId: chat.id });
  }, [conn, chat.id]);


  return (
    <div className={styles.chatView}>
      <div className={styles.messages} ref={scrollRef} onScroll={onScroll}>
        {!ready && messages.length === 0 ? null : messages.length === 0 && !stream.active ? (
          <div className={styles.empty} />
        ) : (
          <div className={styles.inner} ref={innerRef}>
            {messages.map((msg) =>
              msg.role === "user" ? (
                <div key={msg.id} data-rowid={msg.rowid}>
                  <UserBubble
                    message={msg}
                    searchQuery={searchQuery}
                    onToggleAnchor={handleToggleAnchor}
                  />
                </div>
              ) : (
                <div
                  key={msg.id}
                  data-rowid={msg.rowid}
                  className={`${styles.message} ${styles.messageAssistant}`}
                >
                  <ErrorBoundary fallback={<div className={styles.bubbleError}>Failed to render message</div>}>
                    <AgentMessageBubble message={msg} role={chat.role} searchQuery={searchQuery} onToggleAnchor={handleToggleAnchor} />
                  </ErrorBoundary>
                </div>
              )
            )}
            {stream.active && (
              <div className={`${styles.message} ${styles.messageAssistant}`}>
                <AgentMessageBubble
                  message={{
                    id: "streaming",
                    content: "",
                    activities: stream.activities,
                    status: "streaming",
                  }}
                  role={chat.role}
                  chatId={chat.id}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <AnchorTray entries={anchoredEntries} onUnpin={(rowid) => handleToggleAnchor(rowid, false)} onJump={handleAnchorJump} onRename={handleAnchorRename} />
      <AgentTurnInput
        chat={chat}
        conn={conn}
        streaming={stream.active}
        chatProvider={chatProvider}
        chatModel={chatModel}
        supportsThinking={supportsThinking}
        supportsAttachments={effectiveModel?.supportsAttachments}
        contextTokens={messages.findLast((m) => m.role === "assistant" && m.conversationTokens != null)?.conversationTokens}
        contextWindow={effectiveModel?.contextWindow}
        onSend={handleSend}
        onStop={handleStop}
        onModelChange={handleModelChange}
      />
    </div>
  );
}
