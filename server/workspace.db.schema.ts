/** SQLite schema for workspace.db — v0.3.0 clean schema, no migrations. */

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    flagged INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0,
    role TEXT,
    connection_id TEXT NOT NULL DEFAULT '',
    thinking INTEGER,
    knowledge INTEGER NOT NULL DEFAULT 1,
    labels TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);

  CREATE TABLE IF NOT EXISTS entries (
    rowid INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    turn_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('message', 'activity', 'summary')),
    role TEXT,
    content TEXT,
    source TEXT,
    type TEXT,
    metadata TEXT,
    anchored INTEGER NOT NULL DEFAULT 0,
    anchor_name TEXT,
    timestamp TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_entries_chat_rowid ON entries(chat_id, rowid);
  CREATE INDEX IF NOT EXISTS idx_entries_turn ON entries(turn_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    content,
    content=entries,
    content_rowid=rowid
  );

  CREATE TRIGGER IF NOT EXISTS entries_fts_insert AFTER INSERT ON entries
    WHEN new.kind = 'message'
    BEGIN INSERT INTO entries_fts(rowid, content) VALUES (new.rowid, new.content); END;

  CREATE TRIGGER IF NOT EXISTS entries_fts_delete AFTER DELETE ON entries
    WHEN old.kind = 'message'
    BEGIN INSERT INTO entries_fts(entries_fts, rowid, content) VALUES ('delete', old.rowid, old.content); END;

  CREATE TRIGGER IF NOT EXISTS entries_fts_update AFTER UPDATE OF content ON entries
    WHEN new.kind = 'message'
    BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
      INSERT INTO entries_fts(rowid, content) VALUES (new.rowid, new.content);
    END;

  CREATE VIRTUAL TABLE IF NOT EXISTS chats_fts USING fts5(
    chat_id,
    name
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    entry_rowid INTEGER REFERENCES entries(rowid) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    thumbnail BLOB,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_attachments_chat ON attachments(chat_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_entry ON attachments(entry_rowid);
`;

/** Create vec0 virtual table — only if sqlite-vec extension loaded */
export function vecSchema(dimension: number): string {
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_vec USING vec0(
      rowid INTEGER PRIMARY KEY,
      embedding float[${dimension}]
    );
  `;
}

export function migrate(db: { exec: (sql: string) => void; pragma: (sql: string, opts?: any) => any }, log?: (msg: string) => void): void {
  const info = log ?? (() => {});
  info("migrate: executing schema");
  db.exec(SCHEMA);
  info("migrate: complete");
}
