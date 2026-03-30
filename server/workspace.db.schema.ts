/**
 * SQLite schema for workspace.db
 *
 * Base schema (v0) is applied via CREATE IF NOT EXISTS.
 * Incremental migrations run sequentially from the current version.
 * Version is tracked in the `schema_version` table.
 */

const BASE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

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

type Migration = (db: MigratableDb) => void;

const MIGRATIONS: Migration[] = [
  /** v1: add per-chat permission mode */
  (db) => db.exec("ALTER TABLE chats ADD COLUMN mode TEXT"),
  /** v2: add unread flag */
  (db) => db.exec("ALTER TABLE chats ADD COLUMN unread INTEGER NOT NULL DEFAULT 0"),
  /** v3: routines + run history */
  (db) => db.exec(`
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      cron TEXT NOT NULL,
      once INTEGER NOT NULL DEFAULT 0,
      action TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run TEXT,
      next_run TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS routine_runs (
      id TEXT PRIMARY KEY,
      routine_id TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
      chat_id TEXT,
      status TEXT NOT NULL,
      error TEXT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_routine_runs_routine ON routine_runs(routine_id, started_at DESC);
  `),
];

interface MigratableDb {
  exec(sql: string): void;
  pragma(sql: string, opts?: any): any;
  prepare(sql: string): { get(...args: any[]): any; run(...args: any[]): any };
}

/** Create vec0 virtual table — only if sqlite-vec extension loaded */
export function vecSchema(dimension: number): string {
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS entries_vec USING vec0(
      rowid INTEGER PRIMARY KEY,
      embedding float[${dimension}]
    );
  `;
}

export function migrate(db: MigratableDb, log?: (msg: string) => void): void {
  const info = log ?? (() => {});

  info("migrate: applying base schema");
  db.exec(BASE_SCHEMA);

  db.pragma("journal_mode = WAL");

  const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as { version: number } | undefined;
  let current = row?.version ?? 0;

  if (!row) {
    db.prepare("INSERT INTO schema_version (version) VALUES (0)").run();
  }

  for (let i = current; i < MIGRATIONS.length; i++) {
    const version = i + 1;
    try {
      db.exec("BEGIN");
      MIGRATIONS[i](db);
      db.prepare(`UPDATE schema_version SET version = ${version}`).run();
      db.exec("COMMIT");
      current = version;
      info(`migrate: v${version} ok`);
    } catch (err) {
      try { db.exec("ROLLBACK"); } catch {}
      info(`migrate: v${version} error — ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  info(`migrate: complete (v${current})`);
}
