import { useCallback, useRef, useState } from "react";
import type { WsConnection } from "../lib/ws";
import type { ChatActivity, ChatEntry, ChatEvent } from "../types/chat";
import { useStore } from "../store";
import { useWsSubscriber } from "./useWsSubscriber";

export interface StreamingState {
  active: boolean;
  content: string;
  activities: ChatActivity[];
  setActive: (v: boolean, seedActivities?: ChatActivity[], seedContent?: string) => void;
}

const SKIP_ACTIVITY_TYPES = new Set([
  "agent.start", "agent.text.delta", "agent.thinking.delta",
  "agent.thinking.done", "agent.done", "agent.stopped",
]);

/**
 * Real-time agent reply stream for a single chat conversation.
 *
 * Reads streaming content/activities from the store when available
 * (populated by the sync layer), with local fallback for standalone
 * usage (tests, popup windows). Handles entry callbacks and terminal
 * event synthesis (partial messages on stop).
 */
export function useAgentReplyStream(
  conn: WsConnection | null,
  chatId: string,
  onEntry: (entry: ChatEntry) => void,
  onEnd: () => void,
): StreamingState {
  const [active, _setActive] = useState(false);
  const activeRef = useRef(false);
  const turnIdRef = useRef("");
  const contentRef = useRef("");
  const [localActivities, setLocalActivities] = useState<ChatActivity[]>([]);
  const localActivitiesRef = useRef<ChatActivity[]>([]);

  const buffer = useStore((s) => s.streamBuffers.get(chatId));
  const content = buffer?.content || contentRef.current;
  const activities = buffer?.activities?.length ? buffer.activities : localActivities;

  const setActive = useCallback((v: boolean, seedActivities?: ChatActivity[], seedContent?: string) => {
    _setActive(v);
    activeRef.current = v;
    if (seedContent) {
      contentRef.current = seedContent;
    }
    if (seedActivities?.length) {
      localActivitiesRef.current = seedActivities;
      setLocalActivities(seedActivities);
    }
  }, []);

  const reset = useCallback(() => {
    _setActive(false);
    activeRef.current = false;
    turnIdRef.current = "";
    contentRef.current = "";
    localActivitiesRef.current = [];
    setLocalActivities([]);
  }, []);

  useWsSubscriber<ChatEvent>(conn, "chat.event", (event) => {
    if (event.chatId !== chatId) return;
    const { chatId: _, ...entry } = event;

    if (entry.kind === "activity" && entry.type === "agent.thinking.delta") return;
    if (entry.kind === "activity" && entry.type === "agent.text.delta") {
      contentRef.current += (entry as any).data?.content ?? "";
      return;
    }

    if (entry.kind === "activity" && !turnIdRef.current) {
      turnIdRef.current = (entry as ChatActivity).messageId;
    }

    if (entry.kind === "message" && (entry as any).role === "assistant") {
      contentRef.current = "";
    }

    const isTerminal = entry.kind === "activity" &&
      (entry.type === "agent.done" || entry.type === "agent.stopped" || entry.type === "agent.error");

    if (isTerminal && activeRef.current) {
      if (contentRef.current.length > 0) {
        onEntry({
          kind: "message",
          id: turnIdRef.current,
          role: "assistant",
          content: contentRef.current,
          timestamp: new Date().toISOString(),
        });
      }
      onEntry(entry as ChatEntry);
      reset();
      onEnd();
      return;
    } else if (isTerminal && !activeRef.current) {
      onEntry(entry as ChatEntry);
      return;
    } else if (!activeRef.current) {
      activeRef.current = true;
      _setActive(true);
    }

    if (entry.kind === "activity" && !SKIP_ACTIVITY_TYPES.has(entry.type)) {
      const act = entry as ChatActivity;
      localActivitiesRef.current = [...localActivitiesRef.current, act];
      setLocalActivities(localActivitiesRef.current);
    }

    onEntry(entry as ChatEntry);
  }, [chatId, onEntry, onEnd, reset]);

  return { active, content, activities, setActive };
}
