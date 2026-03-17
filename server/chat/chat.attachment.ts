import { existsSync, mkdirSync, copyFileSync, rmSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { v7 as uuid } from "uuid";
import type { EventBus } from "../core/bus";
import type { Logger } from "../logger.types";
import type { ChatDatabase } from "./chat.db";

export interface AttachmentResult {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export function registerAttachmentHandlers(
  bus: EventBus,
  initialDb: ChatDatabase,
  log: Logger,
  getWorkspacePath: () => string,
): { switchDb(newDb: ChatDatabase): void } {
  let db = initialDb;
  function attachDir(chatId: string): string {
    return join(getWorkspacePath(), "chats", chatId, "attachments");
  }

  function attachPath(chatId: string, filename: string): string {
    return join(attachDir(chatId), filename);
  }

  bus.on("chat.attachment.add", (data) => {
    const { chatId, filePath, thumbnail } = data;

    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stat = statSync(filePath);
    const MAX_SIZE = 10 * 1024 * 1024;
    if (stat.size > MAX_SIZE) {
      throw new Error(`File exceeds 10 MB limit: ${basename(filePath)}`);
    }

    const id = uuid();
    let filename = basename(filePath);
    const mimeType = data.mimeType || "application/octet-stream";

    const dir = attachDir(chatId);
    mkdirSync(dir, { recursive: true });

    if (existsSync(join(dir, filename))) {
      const ext = filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "";
      const name = filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename;
      let i = 1;
      while (existsSync(join(dir, `${name} (${i})${ext}`))) i++;
      filename = `${name} (${i})${ext}`;
    }

    copyFileSync(filePath, attachPath(chatId, filename));

    const thumbBuf = thumbnail ? Buffer.from(thumbnail, "base64") : undefined;

    db.addAttachment({
      id,
      chatId,
      filename,
      mimeType,
      size: stat.size,
      thumbnail: thumbBuf,
    });

    log.info("Attachment added", { chatId, id, filename, size: stat.size });

    return {
      attachment: { id, filename, mimeType, size: stat.size } as AttachmentResult,
    };
  });

  bus.on("chat.attachment.remove", (data) => {
    const att = db.getAttachment(data.attachmentId);
    if (!att) return { removed: false };

    const path = attachPath(att.chat_id, att.filename);
    db.deleteAttachment(data.attachmentId);
    try { rmSync(path); } catch {}

    log.info("Attachment removed", { chatId: att.chat_id, id: att.id });
    return { removed: true };
  });

  bus.on("chat.attachment.list", (data) => {
    const rows = db.getPendingAttachments(data.chatId);
    return {
      attachments: rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        mimeType: r.mime_type,
        size: r.size,
      })),
    };
  });

  return {
    switchDb(newDb: ChatDatabase) {
      db = newDb;
    },
  };
}

export function cleanupChatAttachments(workspacePath: string, chatId: string): void {
  const dir = join(workspacePath, "chats", chatId);
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
}
