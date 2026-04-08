import { useCallback } from "react";
import type { WsConnection } from "../lib/ws";
import type { Chat } from "../types/chat";
import type { Section } from "../store/types";

/**
 * Factory for the near-identical "system ask" handlers
 * (connections, skills, routines). Each creates a chat via
 * chat.system.ask, navigates to chats, and selects the result.
 */
export function useSystemAsk(
  conn: WsConnection | null,
  kind: string,
  section: Section,
  selectChat: (chat: Chat | null) => void,
  handleSectionChange: (s: Section) => void,
): (content: string) => Promise<void> {
  return useCallback(async (content: string) => {
    if (!conn) return;
    try {
      const res = await conn.request<{ chatId: string }>("chat.system.ask", { content, kind });
      if (section !== "chats") handleSectionChange("chats");
      conn.request<{ chat: Chat }>("chat.get.id", { id: res.chatId }).then((r) => {
        if (r?.chat) selectChat(r.chat);
      }).catch(() => {});
    } catch (err) {
      console.error(`${kind} ask failed:`, err);
    }
  }, [conn, kind, section, selectChat, handleSectionChange]);
}
