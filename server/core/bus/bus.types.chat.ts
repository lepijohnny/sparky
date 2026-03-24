import type { Chat, ChatEntry, ChatEvent } from "../../chat/chat.types";
import type { PendingApprovalInfo } from "../tool.approval";

export interface ChatEvents {
  "chat.counts":              { req: void; res: { chats: number; flagged: number; archived: number; labeled: number; labels: Record<string, number> } };
  "chat.list":                { req: void; res: { chats: Chat[] } };
  "chat.list.all":            { req: void; res: { chats: Chat[] } };
  "chat.list.flagged":        { req: void; res: { chats: Chat[] } };
  "chat.list.archived":       { req: void; res: { chats: Chat[] } };
  "chat.list.labeled":        { req: { labelId?: string }; res: { chats: Chat[] } };
  "chat.create":              { req: { name?: string }; res: { chat: Chat } };
  "chat.delete":              { req: { id: string }; res: { deleted: boolean } };
  "chat.rename":              { req: { id: string; name: string }; res: { chat: Chat } };
  "chat.retitle":             { req: { id: string }; res: { ok: boolean } };
  "chat.flag":                { req: { id: string; flagged: boolean }; res: { chat: Chat } };
  "chat.unread":              { req: { id: string; unread: boolean }; res: { chat: Chat } };
  "chat.archive":             { req: { id: string; archived: boolean }; res: { chat: Chat } };
  "chat.label":               { req: { id: string; labels: string[] }; res: { chat: Chat } };
  "chat.model":               { req: { id: string; provider: string; model: string }; res: { chat: Chat } };
  "chat.thinking":            { req: { id: string; thinking: number | null }; res: { chat: Chat } };
  "chat.knowledge":           { req: { id: string; knowledge: boolean }; res: { chat: Chat } };
  "chat.mode":                { req: { id: string; mode: string | null }; res: { chat: Chat } };
  "chat.get.id":              { req: { id: string }; res: { chat: Chat; entries: ChatEntry[]; hasMore: boolean; streaming: boolean; partialContent: string | null } | null };
  "chat.entries":             { req: { chatId: string; before?: number }; res: { entries: ChatEntry[]; hasMore: boolean } };
  "chat.anchor.add":          { req: { chatId: string; rowid: number }; res: void };
  "chat.anchor.remove":       { req: { chatId: string; rowid: number }; res: void };
  "chat.anchor.rename":       { req: { chatId: string; rowid: number; name: string }; res: void };
  "chat.anchored":            { req: { chatId: string }; res: { entries: ChatEntry[] } };

  "chat.attachment.add":      { req: { chatId: string; filePath: string; mimeType?: string; thumbnail?: string }; res: { attachment: { id: string; filename: string; mimeType: string; size: number } } };
  "chat.attachment.remove":   { req: { chatId: string; attachmentId: string }; res: { removed: boolean } };
  "chat.attachment.list":     { req: { chatId: string }; res: { attachments: { id: string; filename: string; mimeType: string; size: number }[] } };
  "chat.ask":                 { req: { chatId: string; content: string; attachmentIds?: string[]; services?: string[]; skills?: string[]; mode?: "read" | "write" | "execute" }; res: { ok: boolean } };
  "chat.stop":                { req: { chatId: string }; res: { ok: boolean } };
  "chat.search":              { req: { query: string; flagged?: boolean; archived?: boolean; labelId?: string }; res: { results: { chat: Chat; matchCount: number }[] } };
  "chat.system.ask":          { req: { content: string; kind?: "general" | "connection" | "permissions" | "skills"; mode?: "read" | "write" | "execute" }; res: { chatId: string } };
  "chat.created":             { req: { chat: Chat }; res: void };
  "chat.updated":             { req: { chat: Chat }; res: void };
  "chat.deleted":             { req: { id: string }; res: void };
  "chat.event":               { req: ChatEvent; res: void };

  "tool.approval.pending":    { req: { chatId: string }; res: PendingApprovalInfo | null };
  "tool.approval.request":    { req: { requestId: string; chatId: string; type: "confirm:yesno" | "input:credentials" | "input:oauth"; message: string; scope: string; tool: string; target: string; canPersist: boolean; timeoutMs: number; remainingMs: number; description?: string; fields?: { name: string; label: string; type: string }[]; link?: string; oauth?: { authUrl: string; tokenUrl: string; scopes: string[]; tokenKey: string } }; res: void };
  "tool.approval.resolve":    { req: { requestId: string; approved: boolean; persist?: boolean }; res: void };
  "tool.approval.dismissed":  { req: { requestId: string; chatId: string }; res: void };
}
