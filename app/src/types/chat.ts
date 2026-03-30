/** Chat metadata */
export interface Chat {
  id: string;
  name: string;
  model: string;
  provider: string;
  connectionId?: string;
  thinking?: number | null;
  knowledge?: boolean;
  mode?: string | null;
  flagged?: boolean;
  archived?: boolean;
  unread?: boolean;
  role?: string;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
  sizeBytes?: number;
}

/** A single entry */
export type ChatEntry = ChatMessage | ChatActivity;

/** A visible chat message (user question or assistant text response) */
export interface MessageAttachment {
  id?: string;
  filename: string;
  mimeType: string;
  size?: number;
  thumbnailUrl?: string;
  thumbnailDataUrl?: string;
  filePath?: string;
}

export interface ChatMessage {
  kind: "message";
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  rowid?: number;
  anchored?: boolean;
  anchorName?: string;
  attachments?: MessageAttachment[];
}

/** Per-type data payloads for chat activities */
export type ChatActivityData =
  | { type: "agent.start" }
  | { type: "agent.done" }
  | { type: "agent.stopped" }
  | { type: "agent.text.delta"; data: { content: string } }
  | { type: "agent.thinking.start" }
  | { type: "agent.thinking.delta"; data: { content: string } }
  | { type: "agent.thinking.done"; data: { content: string } }
  | { type: "agent.tool.start"; data: { id: string; name: string; input: unknown } }
  | { type: "agent.tool.result"; data: { id: string; output: unknown } }
  | { type: "agent.tool.denied"; data: { id: string } }
  | { type: "agent.error"; data: { message: string } }
  | { type: "agent.knowledge"; data: { sources: { file: string; section?: string; score: number }[] } }
  | { type: "agent.approval.requested"; data: { scope: string; tool: string; target: string; message: string } }
  | { type: "agent.approval.approved"; data: { scope: string; tool: string; target: string } }
  | { type: "agent.approval.denied"; data: { scope: string; tool: string; target: string; reason?: string } };

/** Base fields shared by all activities */
interface ChatActivityBase {
  kind: "activity";
  messageId: string;
  source: string;
  timestamp: string;
  rowid?: number;
}

/** A discriminated-union activity anchored to an assistant message via messageId. */
export type ChatActivity = ChatActivityBase & ChatActivityData;

/** Chat event pushed via WS */
export type ChatEvent = { chatId: string } & ChatEntry;
