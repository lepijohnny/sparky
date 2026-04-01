import Database from "better-sqlite3";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Logger } from "../logger.types";
import type { Chat, ChatSummary } from "./chat.types";
import type { ChatEntry, ChatMessage } from "./chat.types";
import { migrate, vecSchema } from "../workspace.db.schema";

interface ChatRow {
  id: string;
  name: string;
  provider: string;
  model: string;
  connection_id: string;
  thinking: number | null;
  knowledge: number;
  mode: string | null;
  flagged: number;
  archived: number;
  unread: number;
  role: string | null;
  labels: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttachmentRow {
  id: string;
  chat_id: string;
  entry_rowid: number | null;
  filename: string;
  mime_type: string;
  size: number;
  thumbnail: Buffer | null;
  created_at: string;
}

interface EntryRow {
  rowid: number;
  chat_id: string;
  turn_id: string;
  kind: string;
  role: string | null;
  content: string | null;
  source: string | null;
  type: string | null;
  metadata: string | null;
  anchored: number;
  anchor_name: string | null;
  timestamp: string;
}

function prepare(db: Database.Database) {
  return {
    createChat: db.prepare(`
      INSERT INTO chats (id, name, provider, model, connection_id, thinking, knowledge, mode, flagged, archived, unread, role, labels, created_at, updated_at)
      VALUES (:id, :name, :provider, :model, :connection_id, :thinking, :knowledge, :mode, :flagged, :archived, :unread, :role, :labels, :created_at, :updated_at)
    `),

    getChat: db.prepare(
      "SELECT * FROM chats WHERE id = :id"
    ),

    updateChat: db.prepare(`
      UPDATE chats SET
        name = :name, provider = :provider, model = :model, connection_id = :connection_id,
        thinking = :thinking, knowledge = :knowledge, mode = :mode, flagged = :flagged, archived = :archived, unread = :unread, labels = :labels,
        updated_at = :updated_at
      WHERE id = :id
    `),

    deleteChat: db.prepare(
      "DELETE FROM chats WHERE id = :id"
    ),

    allChats: db.prepare("SELECT * FROM chats"),

    createChatFts: db.prepare(
      "INSERT INTO chats_fts (chat_id, name) VALUES (:id, :name)"
    ),

    deleteChatFts: db.prepare(
      "DELETE FROM chats_fts WHERE chat_id = :id"
    ),

    addMessage: db.prepare(`
      INSERT INTO entries (chat_id, turn_id, kind, role, content, timestamp)
      VALUES (:chat_id, :turn_id, :kind, :role, :content, :timestamp)
    `),

    addActivity: db.prepare(`
      INSERT INTO entries (chat_id, turn_id, kind, source, type, metadata, timestamp)
      VALUES (:chat_id, :turn_id, :kind, :source, :type, :metadata, :timestamp)
    `),

    setAnchor: db.prepare(
      "UPDATE entries SET anchored = :anchored WHERE rowid = :rowid AND chat_id = :chat_id"
    ),

    setAnchorName: db.prepare(
      "UPDATE entries SET anchor_name = :name WHERE rowid = :rowid AND chat_id = :chat_id AND anchored = 1"
    ),

    getAnchored: db.prepare(
      "SELECT * FROM entries WHERE chat_id = :chat_id AND anchored = 1 ORDER BY rowid ASC"
    ),

    firstUserMessage: db.prepare(
      "SELECT rowid FROM entries WHERE chat_id = :chat_id AND kind = 'message' AND role = 'user' ORDER BY rowid ASC LIMIT 1"
    ),

    getSummary: db.prepare(
      "SELECT rowid, content, metadata, timestamp FROM entries WHERE chat_id = :chat_id AND kind = 'summary' LIMIT 1"
    ),

    upsertSummary: db.prepare(`
      INSERT INTO entries (chat_id, turn_id, kind, source, type, content, metadata, timestamp)
      VALUES (:chat_id, 'summary', 'summary', 'system', 'conversation.summary', :content, :metadata, :timestamp)
      ON CONFLICT(rowid) DO UPDATE SET content = :content, metadata = :metadata, timestamp = :timestamp
    `),

    deleteSummary: db.prepare(
      "DELETE FROM entries WHERE chat_id = :chat_id AND kind = 'summary'"
    ),

    getEntriesRange: db.prepare(
      "SELECT * FROM entries WHERE chat_id = :chat_id AND kind = 'message' AND rowid >= :from_rowid AND rowid <= :to_rowid ORDER BY rowid ASC"
    ),

    addAttachment: db.prepare(`
      INSERT INTO attachments (id, chat_id, entry_rowid, filename, mime_type, size, thumbnail, created_at)
      VALUES (:id, :chat_id, :entry_rowid, :filename, :mime_type, :size, :thumbnail, :created_at)
    `),

    bindAttachment: db.prepare(
      "UPDATE attachments SET entry_rowid = :entry_rowid WHERE id = :id"
    ),

    getAttachment: db.prepare(
      "SELECT * FROM attachments WHERE id = :id"
    ),

    getAttachmentsByChat: db.prepare(
      "SELECT * FROM attachments WHERE chat_id = :chat_id AND entry_rowid IS NULL ORDER BY created_at ASC"
    ),

    getAllAttachmentsByChat: db.prepare(
      "SELECT DISTINCT filename, mime_type FROM attachments WHERE chat_id = :chat_id AND entry_rowid IS NOT NULL ORDER BY created_at ASC"
    ),

    getAttachmentsByEntry: db.prepare(
      "SELECT * FROM attachments WHERE entry_rowid = :entry_rowid ORDER BY created_at ASC"
    ),

    deleteAttachment: db.prepare(
      "DELETE FROM attachments WHERE id = :id RETURNING id"
    ),

  };
}

export class ChatDatabase {
  private db: Database.Database;
  private sql: ReturnType<typeof prepare>;
  private vecEnabled = false;
  readonly path: string;
  wsDir = "";

  get connection(): Database.Database { return this.db; }

  constructor(dbPath: string, private log: Logger) {
    this.path = dbPath;
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    migrate(this.db, (msg) => this.log.info(msg));
    this.sql = prepare(this.db);
  }

  close(): void {
    this.db.close();
  }

  loadVecExtension(extensionPath: string, dimension = 768): void {
    try {
      this.db.loadExtension(extensionPath);
      this.db.exec(vecSchema(dimension));
      this.vecEnabled = true;
      this.log.info("Vector search enabled", { dimension });
    } catch (err) {
      this.log.warn("sqlite-vec not available, vector search disabled", { error: String(err) });
    }
  }

  createChat(chat: Chat): void {
    const txn = this.db.transaction(() => {
      this.sql.createChat.run({
        id: chat.id,
        name: chat.name,
        provider: chat.provider,
        model: chat.model,
        connection_id: chat.connectionId ?? "",
        thinking: chat.thinking ?? null,
        knowledge: chat.knowledge !== false ? 1 : 0,
        mode: chat.mode ?? null,
        flagged: chat.flagged ? 1 : 0,
        archived: chat.archived ? 1 : 0,
        unread: chat.unread ? 1 : 0,
        role: chat.role ?? null,
        labels: chat.labels?.length ? JSON.stringify(chat.labels) : null,
        created_at: chat.createdAt,
        updated_at: chat.updatedAt,
      });
      this.sql.createChatFts.run({ id: chat.id, name: chat.name });
    });
    txn();
  }

  getChat(id: string): Chat | null {
    const row = this.sql.getChat.get({ id: id }) as ChatRow | undefined;
    if (!row) return null;
    return this.withSize(this.toChat(row));
  }

  updateChat(id: string, fields: Partial<Pick<Chat, "name" | "provider" | "model" | "connectionId" | "thinking" | "knowledge" | "mode" | "flagged" | "archived" | "unread" | "labels" | "updatedAt">>): Chat | null {
    const chat = this.getChat(id);
    if (!chat) return null;

    const updated = { ...chat, ...fields };
    const txn = this.db.transaction(() => {
      this.sql.updateChat.run({
        id: id,
        name: updated.name,
        provider: updated.provider,
        model: updated.model,
        connection_id: updated.connectionId ?? "",
        thinking: updated.thinking ?? null,
        knowledge: updated.knowledge !== false ? 1 : 0,
        mode: updated.mode ?? null,
        flagged: updated.flagged ? 1 : 0,
        archived: updated.archived ? 1 : 0,
        unread: updated.unread ? 1 : 0,
        labels: updated.labels?.length ? JSON.stringify(updated.labels) : null,
        updated_at: updated.updatedAt,
      });

      if (fields.name !== undefined) {
        this.sql.deleteChatFts.run({ id: id });
        this.sql.createChatFts.run({ id: id, name: updated.name });
      }
    });
    txn();

    const result = this.getChat(id);
    return result;
  }

  deleteChat(id: string): boolean {
    const txn = this.db.transaction(() => {
      this.sql.deleteChatFts.run({ id: id });
      const result = this.sql.deleteChat.run({ id: id });
      return result.changes > 0;
    });
    return txn();
  }

  getChats(filter?: { archived?: boolean; flagged?: boolean; labelId?: string }): Chat[] {
    let sql = `SELECT chats.*, COALESCE(s.size_bytes, 0) AS size_bytes
      FROM chats
      LEFT JOIN (
        SELECT chat_id, SUM(COALESCE(LENGTH(content), 0) + COALESCE(LENGTH(metadata), 0)) AS size_bytes
        FROM entries GROUP BY chat_id
      ) s ON s.chat_id = chats.id`;
    const conditions: string[] = [];
    const params: Record<string, any> = {};

    if (filter?.archived === true) {
      conditions.push("chats.archived = 1");
    } else if (filter?.archived === false) {
      conditions.push("chats.archived = 0");
    }

    if (filter?.flagged === true) {
      conditions.push("chats.flagged = 1");
    }

    if (filter?.labelId) {
      conditions.push("EXISTS (SELECT 1 FROM json_each(chats.labels) WHERE json_each.value = :labelId)");
      params.labelId = filter.labelId;
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += " ORDER BY chats.updated_at DESC";

    const rows = this.db.prepare(sql).all(params) as (ChatRow & { size_bytes: number })[];
    return rows.map((r) => ({ ...this.toChat(r), sizeBytes: r.size_bytes + this.toolsDirSize(r.id) }));
  }

  withSize(chat: Chat): Chat {
    const row = this.db.prepare("SELECT COALESCE(SUM(COALESCE(LENGTH(content), 0) + COALESCE(LENGTH(metadata), 0)), 0) AS size_bytes FROM entries WHERE chat_id = ?").get(chat.id) as { size_bytes: number };
    return { ...chat, sizeBytes: (row?.size_bytes ?? 0) + this.toolsDirSize(chat.id) };
  }

  private toolsDirSize(chatId: string): number {
    try {
      const dir = join(this.wsDir, "chats", chatId, "tools");
      return readdirSync(dir).reduce((sum, f) => sum + statSync(join(dir, f)).size, 0);
    } catch { return 0; }
  }

  getCounts(): { chats: number; flagged: number; archived: number; labeled: number; labels: Record<string, number> } {
    const all = this.sql.allChats.all() as ChatRow[];

    let chats = 0;
    let flagged = 0;
    let archived = 0;
    let labeled = 0;
    const labels: Record<string, number> = {};

    for (const row of all) {
      if (row.archived) {
        archived++;
      } else {
        chats++;
        if (row.flagged) flagged++;
        const chatLabels: string[] = row.labels ? JSON.parse(row.labels) : [];
        if (chatLabels.length > 0) {
          labeled++;
          for (const id of chatLabels) {
            labels[id] = (labels[id] ?? 0) + 1;
          }
        }
      }
    }

    return { chats, flagged, archived, labeled, labels };
  }

  removeLabel(labelId: string): Chat[] {
    const chats = this.getChats({ labelId });
    const updated: Chat[] = [];

    for (const chat of chats) {
      const newLabels = (chat.labels ?? []).filter((l) => l !== labelId);
      const result = this.updateChat(chat.id, {
        labels: newLabels.length > 0 ? newLabels : undefined,
      });
      if (result) updated.push(result);
    }

    return updated;
  }

  branchChat(chat: Chat, sourceChatId: string, beforeRowid: number): number {
    const txn = this.db.transaction(() => {
      this.sql.createChat.run({
        id: chat.id,
        name: chat.name,
        provider: chat.provider,
        model: chat.model,
        connection_id: chat.connectionId ?? "",
        thinking: chat.thinking ?? null,
        knowledge: chat.knowledge !== false ? 1 : 0,
        mode: chat.mode ?? null,
        flagged: chat.flagged ? 1 : 0,
        archived: chat.archived ? 1 : 0,
        unread: chat.unread ? 1 : 0,
        role: chat.role ?? null,
        labels: chat.labels?.length ? JSON.stringify(chat.labels) : null,
        created_at: chat.createdAt,
        updated_at: chat.updatedAt,
      });
      this.sql.createChatFts.run({ id: chat.id, name: chat.name });

      const turn = this.db.prepare(
        "SELECT turn_id FROM entries WHERE chat_id = :source_id AND rowid = :rowid"
      ).get({ source_id: sourceChatId, rowid: beforeRowid }) as { turn_id: string } | undefined;

      const result = this.db.prepare(`
        INSERT INTO entries (chat_id, turn_id, kind, role, content, source, type, metadata, anchored, anchor_name, timestamp)
        SELECT :target_id, turn_id, kind, role, content, source, type, metadata, anchored, anchor_name, timestamp
        FROM entries WHERE chat_id = :source_id AND (rowid <= :before_rowid OR turn_id = :turn_id) ORDER BY rowid ASC
      `).run({ target_id: chat.id, source_id: sourceChatId, before_rowid: beforeRowid, turn_id: turn?.turn_id ?? "" });

      return result.changes;
    });
    return txn();
  }

  addEntry(chatId: string, entry: ChatEntry): number {
    if (entry.kind === "message") {
      const result = this.sql.addMessage.run({
        chat_id: chatId,
        turn_id: entry.id,
        kind: "message",
        role: entry.role,
        content: entry.content,
        timestamp: entry.timestamp,
      });
      return Number(result.lastInsertRowid);
    }

    const result = this.sql.addActivity.run({
      chat_id: chatId,
      turn_id: entry.messageId,
      kind: "activity",
      source: entry.source,
      type: entry.type,
      timestamp: entry.timestamp,
      metadata: entry.data ? JSON.stringify(entry.data) : null,
    });
    return Number(result.lastInsertRowid);
  }

  getAllEntries(chatId: string): ChatEntry[] {
    const rows = this.db.prepare("SELECT * FROM entries WHERE chat_id = :chat_id ORDER BY rowid ASC").all({ chat_id: chatId }) as EntryRow[];
    return rows.map((r) => this.toEntry(r));
  }

  getEntries(chatId: string, messageLimit = 10, beforeRowid?: number): { entries: ChatEntry[]; hasMore: boolean } {
    let boundarySql: string;
    let boundaryParams: Record<string, any>;

    if (beforeRowid !== undefined) {
      boundarySql = `
        SELECT rowid FROM entries
        WHERE chat_id = :chat_id AND kind = 'message' AND rowid < :before
        ORDER BY rowid DESC LIMIT 1 OFFSET :offset
      `;
      boundaryParams = { chat_id: chatId, before: beforeRowid, offset: messageLimit };
    } else {
      boundarySql = `
        SELECT rowid FROM entries
        WHERE chat_id = :chat_id AND kind = 'message'
        ORDER BY rowid DESC LIMIT 1 OFFSET :offset
      `;
      boundaryParams = { chat_id: chatId, offset: messageLimit };
    }

    const boundaryRow = this.db.prepare(boundarySql).get(boundaryParams) as { rowid: number } | undefined;
    const hasMore = boundaryRow !== undefined;

    let fetchSql: string;
    let fetchParams: Record<string, any>;

    if (beforeRowid !== undefined && boundaryRow) {
      fetchSql = "SELECT * FROM entries WHERE chat_id = :chat_id AND rowid >= :from AND rowid < :before ORDER BY rowid ASC";
      fetchParams = { chat_id: chatId, from: boundaryRow.rowid + 1, before: beforeRowid };
    } else if (beforeRowid !== undefined) {
      fetchSql = "SELECT * FROM entries WHERE chat_id = :chat_id AND rowid < :before ORDER BY rowid ASC";
      fetchParams = { chat_id: chatId, before: beforeRowid };
    } else if (boundaryRow) {
      fetchSql = "SELECT * FROM entries WHERE chat_id = :chat_id AND rowid > :from ORDER BY rowid ASC";
      fetchParams = { chat_id: chatId, from: boundaryRow.rowid };
    } else {
      fetchSql = "SELECT * FROM entries WHERE chat_id = :chat_id ORDER BY rowid ASC";
      fetchParams = { chat_id: chatId };
    }

    const rows = this.db.prepare(fetchSql).all(fetchParams) as EntryRow[];
    const entries = rows.map((r) => this.toEntry(r));

    return { entries, hasMore };
  }

  searchEntries(query: string, chatId?: string): ChatEntry[] {
    const ftsQuery = this.sanitizeFtsQuery(query);
    if (!ftsQuery) return [];

    let sql: string;
    let params: Record<string, any>;

    if (chatId) {
      sql = `
        SELECT entries.* FROM entries_fts
        JOIN entries ON entries.rowid = entries_fts.rowid
        WHERE entries_fts MATCH :query AND entries.chat_id = :chat_id
        ORDER BY rank
        LIMIT 50
      `;
      params = { query: ftsQuery, chat_id: chatId };
    } else {
      sql = `
        SELECT entries.* FROM entries_fts
        JOIN entries ON entries.rowid = entries_fts.rowid
        WHERE entries_fts MATCH :query
        ORDER BY rank
        LIMIT 50
      `;
      params = { query: ftsQuery };
    }

    const rows = this.db.prepare(sql).all(params) as EntryRow[];
    return rows.map((r) => this.toEntry(r));
  }

  searchChats(
    query: string,
    filter?: { flagged?: boolean; archived?: boolean; labelId?: string },
  ): { chat: Chat; matchCount: number }[] {
    const ftsQuery = this.sanitizeFtsQuery(query);
    if (!ftsQuery) return [];

    const filterConditions: string[] = [];
    const params: Record<string, any> = { query: ftsQuery };

    if (filter?.flagged !== undefined) {
      filterConditions.push(`chats.flagged = :flagged`);
      params.flagged = filter.flagged ? 1 : 0;
    }
    if (filter?.archived !== undefined) {
      filterConditions.push(`chats.archived = :archived`);
      params.archived = filter.archived ? 1 : 0;
    }
    if (filter?.labelId) {
      filterConditions.push(`EXISTS (SELECT 1 FROM json_each(chats.labels) WHERE json_each.value = :labelId)`);
      params.labelId = filter.labelId;
    }

    const filterWhere = filterConditions.length > 0
      ? `AND ${filterConditions.join(" AND ")}`
      : "";

    const likeTerms = query.trim().toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    const occurrenceExpr = likeTerms.length > 0
      ? likeTerms.map((_, i) => `(LENGTH(LOWER(entries.content)) - LENGTH(REPLACE(LOWER(entries.content), :like${i}, ''))) / LENGTH(:like${i})`).join(" + ")
      : "1";
    for (let i = 0; i < likeTerms.length; i++) {
      params[`like${i}`] = likeTerms[i];
    }

    const sql = `
      SELECT chats.*, SUM(match_count) AS match_count FROM (
        SELECT entries.chat_id, SUM(${occurrenceExpr}) AS match_count
        FROM entries_fts
        JOIN entries ON entries.rowid = entries_fts.rowid
        WHERE entries_fts MATCH :query
        GROUP BY entries.chat_id
        UNION ALL
        SELECT chats_fts.chat_id, COUNT(*) AS match_count
        FROM chats_fts
        WHERE chats_fts MATCH :query
        GROUP BY chats_fts.chat_id
      ) AS hits
      JOIN chats ON chats.id = hits.chat_id
      WHERE 1=1 ${filterWhere}
      GROUP BY chats.id
      ORDER BY match_count DESC
      LIMIT 50
    `;

    const rows = this.db.prepare(sql).all(params) as (ChatRow & { match_count: number })[];

    return rows.map((row) => ({
      chat: this.toChat(row),
      matchCount: row.match_count,
    }));
  }

  private sanitizeFtsQuery(query: string): string {
    return query.split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w) => `"${w.replace(/"/g, '""')}"*`)
      .join(" ");
  }

  private toChat(row: ChatRow): Chat {
    return {
      id: row.id,
      name: row.name,
      provider: row.provider,
      model: row.model,
      connectionId: row.connection_id || undefined,
      thinking: row.thinking ?? null,
      knowledge: row.knowledge === 1,
      mode: row.mode ?? null,
      flagged: row.flagged === 1,
      archived: row.archived === 1,
      unread: row.unread === 1,
      role: row.role ?? undefined,
      labels: row.labels ? JSON.parse(row.labels) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getLastUserEntry(chatId: string): ChatMessage | null {
    const row = this.db.prepare(
      `SELECT rowid, * FROM entries
       WHERE chat_id = :chat_id AND kind = 'message' AND role = 'user'
       ORDER BY rowid DESC LIMIT 1`,
    ).get({ chat_id: chatId }) as EntryRow | undefined;
    if (!row) return null;
    return this.toEntry(row) as ChatMessage;
  }

  appendSteering(chatId: string, turnId: string, content: string, activity: ChatEntry): void {
    const txn = this.db.transaction(() => {
      const userMsg = this.getLastUserEntry(chatId);
      if (userMsg) {
        this.updateMessageContent(chatId, userMsg.id, userMsg.content + "\n" + content);
      }
      this.addEntry(chatId, activity);
    });
    txn();
  }

  updateMessageContent(chatId: string, turnId: string, content: string): void {
    this.db.prepare(
      `UPDATE entries SET content = :content WHERE chat_id = :chat_id AND turn_id = :turn_id AND kind = 'message'`,
    ).run({ chat_id: chatId, turn_id: turnId, content });
  }

  getRecentUserMessages(chatId: string, limit = 3): string[] {
    const rows = this.db.prepare(
      `SELECT content FROM entries
       WHERE chat_id = :chat_id AND kind = 'message' AND role = 'user'
       ORDER BY rowid DESC LIMIT :limit`,
    ).all({ chat_id: chatId, limit }) as { content: string }[];
    return rows.reverse().map((r) => r.content);
  }

  toggleAnchor(chatId: string, rowid: number, anchored: boolean): void {
    this.sql.setAnchor.run({ chat_id: chatId, rowid, anchored: anchored ? 1 : 0 });
    if (!anchored) this.sql.setAnchorName.run({ chat_id: chatId, rowid, name: null });
  }

  renameAnchor(chatId: string, rowid: number, name: string | null): void {
    this.sql.setAnchorName.run({ chat_id: chatId, rowid, name: name || null });
  }

  getAnchored(chatId: string): ChatEntry[] {
    const rows = this.sql.getAnchored.all({ chat_id: chatId }) as EntryRow[];
    return rows.map((r) => this.toEntry(r));
  }

  autoAnchorFirst(chatId: string): void {
    const row = this.sql.firstUserMessage.get({ chat_id: chatId }) as { rowid: number } | undefined;
    if (row) this.sql.setAnchor.run({ chat_id: chatId, rowid: row.rowid, anchored: 1 });
  }

  getFirstUserMessageRowid(chatId: string): number | undefined {
    const row = this.sql.firstUserMessage.get({ chat_id: chatId }) as { rowid: number } | undefined;
    return row?.rowid;
  }

  getSummary(chatId: string): ChatSummary | null {
    const row = this.sql.getSummary.get({ chat_id: chatId }) as { rowid: number; content: string; metadata: string | null; timestamp: string } | undefined;
    if (!row) return null;
    const meta = row.metadata ? JSON.parse(row.metadata) : {};
    return {
      kind: "summary",
      content: row.content,
      coversUpTo: meta.coversUpTo ?? 0,
      timestamp: row.timestamp,
      rowid: row.rowid,
    };
  }

  upsertSummary(chatId: string, content: string, coversUpTo: number): void {
    this.sql.deleteSummary.run({ chat_id: chatId });
    this.sql.upsertSummary.run({
      chat_id: chatId,
      content,
      metadata: JSON.stringify({ coversUpTo }),
      timestamp: new Date().toISOString(),
    });
  }

  getEntriesRange(chatId: string, fromRowid: number, toRowid: number): ChatEntry[] {
    const rows = this.sql.getEntriesRange.all({ chat_id: chatId, from_rowid: fromRowid, to_rowid: toRowid }) as EntryRow[];
    return rows.map((r) => this.toEntry(r));
  }

  addAttachment(att: { id: string; chatId: string; entryRowid?: number; filename: string; mimeType: string; size: number; thumbnail?: Buffer }): void {
    this.sql.addAttachment.run({
      id: att.id,
      chat_id: att.chatId,
      entry_rowid: att.entryRowid ?? null,
      filename: att.filename,
      mime_type: att.mimeType,
      size: att.size,
      thumbnail: att.thumbnail ?? null,
      created_at: new Date().toISOString(),
    });
  }

  addEntryWithAttachments(chatId: string, entry: ChatEntry, attachmentIds: string[]): number {
    const txn = this.db.transaction(() => {
      const rowid = this.addEntry(chatId, entry);
      for (const attId of attachmentIds) {
        this.sql.bindAttachment.run({ id: attId, entry_rowid: rowid });
      }
      return rowid;
    });
    return txn();
  }

  getAttachment(id: string): AttachmentRow | null {
    return (this.sql.getAttachment.get({ id }) as AttachmentRow | undefined) ?? null;
  }

  getPendingAttachments(chatId: string): AttachmentRow[] {
    return this.sql.getAttachmentsByChat.all({ chat_id: chatId }) as AttachmentRow[];
  }

  getAllChatAttachments(chatId: string): { filename: string; mime_type: string }[] {
    return this.sql.getAllAttachmentsByChat.all({ chat_id: chatId }) as { filename: string; mime_type: string }[];
  }

  deleteAttachment(id: string): boolean {
    const rows = this.sql.deleteAttachment.all({ id }) as { id: string }[];
    return rows.length > 0;
  }

  enrichWithAttachments(entries: ChatEntry[], workspacePath?: string): ChatEntry[] {
    const txn = this.db.transaction(() => {
      for (const entry of entries) {
        if (entry.kind === "message" && entry.role === "user" && entry.rowid != null) {
          const rows = this.sql.getAttachmentsByEntry.all({ entry_rowid: entry.rowid }) as AttachmentRow[];
          if (rows.length > 0) {
            entry.attachments = rows.map((r) => ({
              id: r.id,
              filename: r.filename,
              mimeType: r.mime_type,
              size: r.size,
              filePath: workspacePath ? join(workspacePath, "chats", r.chat_id, "attachments", r.filename) : undefined,
              thumbnailDataUrl: r.thumbnail ? `data:image/jpeg;base64,${r.thumbnail.toString("base64")}` : undefined,
            }));
          }
        }
      }
    });
    txn();
    return entries;
  }

  private toEntry(row: EntryRow): ChatEntry {
    if (row.kind === "message") {
      return {
        kind: "message",
        id: row.turn_id,
        role: row.role as "user" | "assistant",
        content: row.content ?? "",
        timestamp: row.timestamp,
        rowid: row.rowid,
        anchored: row.anchored === 1,
        anchorName: row.anchor_name ?? undefined,
      };
    }

    return {
      kind: "activity",
      messageId: row.turn_id,
      source: row.source ?? "",
      type: row.type ?? "",
      timestamp: row.timestamp,
      data: row.metadata ? JSON.parse(row.metadata) : undefined,
      rowid: row.rowid,
    };
  }
}
