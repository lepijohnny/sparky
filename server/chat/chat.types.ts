/** Chat metadata */
export interface Chat {
  id: string;
  name: string;
  model: string;
  provider: string;
  /** Specific LLM connection ID — resolves ambiguity when multiple connections share a provider */
  connectionId?: string;
  /** Thinking level override (0–4). null = inherit from connection. */
  thinking?: number | null;
  /** Whether knowledge sources are searched for context */
  knowledge?: boolean;
  /** Permission mode override — null inherits from global trust mode */
  mode?: string | null;
  flagged?: boolean;
  archived?: boolean;
  unread?: boolean;
  /** Prompt role — determines system prompt, tools, and context features */
  role?: string;
  /** Custom working directory for tools (bash, read, write, etc.) */
  cwd?: string | null;
  labels?: string[];
  createdAt: string;
  updatedAt: string;
  sizeBytes?: number;
}

/** A single entry in the database */
export type ChatEntry = ChatMessage | ChatActivity;

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  filePath?: string;
  thumbnailDataUrl?: string;
}

/** A visible chat message (user question or assistant text response) */
export interface ChatMessage {
  kind: "message";
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  rowid?: number;
  anchored?: boolean;
  anchorName?: string;
  attachments?: AttachmentMeta[];
}

/**
 * An activity anchored to an assistant message via messageId.
 * Source and type are free-form strings so any system can emit activities.
 */
export interface ChatActivity {
  kind: "activity";
  messageId: string;
  /** Who produced this: "agent", "sandbox", "tool", "system", etc. */
  source: string;
  /** Activity type: "thinking.start", "tool.start",
   *  "text.delta", "error", "done", "stopped", etc. */
  type: string;
  timestamp: string;
  /** Free-form payload — varies by source + type */
  data?: Record<string, unknown>;
  rowid?: number;
}

/** A conversation summary entry */
export interface ChatSummary {
  kind: "summary";
  content: string;
  coversUpTo: number;
  timestamp: string;
  rowid?: number;
}

/** Events pushed to frontend via WS during a turn */
export type ChatEvent = { chatId: string } & ChatEntry;
