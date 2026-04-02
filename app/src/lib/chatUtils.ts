import type { SpinnerStatus } from "../components/chat/Spinner";
import type { ChatActivity, ChatEntry, MessageAttachment } from "../types/chat";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  activities: ChatActivity[];
  status: SpinnerStatus;
  rowid?: number;
  anchored?: boolean;
  conversationTokens?: number;
  contextWindow?: number;
  durationMs?: number;
  attachments?: MessageAttachment[];
}

const HIDDEN_ACTIVITY_TYPES = new Set(["agent.start", "agent.thinking.done"]);

/**
 * Collapse raw entries into displayable messages.
 * Only called on history entries (loaded from server), not on
 * every streaming tick — streaming is handled separately.
 */
export function collapseEntries(entries: ChatEntry[]): Message[] {
  const messages: Message[] = [];
  const turnMap = new Map<string, { activities: ChatActivity[]; status: SpinnerStatus; assistantContent: string; assistantRowid?: number; assistantAnchored?: boolean; conversationTokens?: number; contextWindow?: number; durationMs?: number }>();

  for (const entry of entries) {
    if (entry.kind === "activity") {
      const tid = entry.messageId;
      if (!turnMap.has(tid)) turnMap.set(tid, { activities: [], status: "streaming", assistantContent: "" });
      const turn = turnMap.get(tid)!;

      if (entry.type === "agent.done") {
        turn.status = turn.status === "error" ? "error" : "done";
        if ((entry.data as any)?.conversationTokens != null) {
          turn.conversationTokens = (entry.data as any).conversationTokens;
          turn.contextWindow = (entry.data as any).contextWindow;
          turn.durationMs = (entry.data as any).durationMs;
        }
      } else if (entry.type === "agent.stopped") {
        turn.status = "stopped";
        if ((entry.data as any)?.conversationTokens != null) {
          turn.conversationTokens = (entry.data as any).conversationTokens;
          turn.contextWindow = (entry.data as any).contextWindow;
          turn.durationMs = (entry.data as any).durationMs;
        }
      } else if (entry.type === "agent.error") {
        turn.status = "error";
        if ((entry.data as any)?.conversationTokens != null) {
          turn.conversationTokens = (entry.data as any).conversationTokens;
          turn.contextWindow = (entry.data as any).contextWindow;
          turn.durationMs = (entry.data as any).durationMs;
        }
        turn.activities.push(entry);
      } else if (!HIDDEN_ACTIVITY_TYPES.has(entry.type)) {
        turn.activities.push(entry);
      }
    } else if (entry.kind === "message" && entry.role === "assistant") {
      if (!turnMap.has(entry.id)) turnMap.set(entry.id, { activities: [], status: "streaming", assistantContent: "" });
      const turn = turnMap.get(entry.id)!;
      turn.assistantContent = entry.content;
      turn.assistantRowid = entry.rowid;
      turn.assistantAnchored = entry.anchored;
    }
  }

  for (const entry of entries) {
    if (entry.kind !== "message" || entry.role !== "user") continue;
    const turn = turnMap.get(entry.id);

    messages.push({
      id: entry.id + "-user",
      role: "user",
      content: entry.content,
      activities: [],
      status: "done",
      rowid: entry.rowid,
      anchored: entry.anchored,
      attachments: entry.attachments,
    });

    if (turn && turn.status !== "streaming") {
      messages.push({
        id: entry.id + "-assistant",
        role: "assistant",
        content: turn.assistantContent,
        activities: turn.activities,
        status: turn.status,
        rowid: turn.assistantRowid,
        anchored: turn.assistantAnchored,
        conversationTokens: turn.conversationTokens,
        contextWindow: turn.contextWindow,
        durationMs: turn.durationMs,
      });
    }
  }

  return messages;
}
