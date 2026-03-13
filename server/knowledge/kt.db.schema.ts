/** Knowledge sources schema for workspace.kt.db */

export const KT_SCHEMA = `
  CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('file', 'folder', 'url')),
    location TEXT NOT NULL,
    file_count INTEGER NOT NULL DEFAULT 1,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    mode TEXT NOT NULL DEFAULT 'keyword' CHECK(mode IN ('keyword', 'hybrid')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'indexing', 'ready', 'error', 'cancelled')),
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS source_files (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    ext TEXT NOT NULL,
    size INTEGER NOT NULL DEFAULT 0,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_source_files_source ON source_files(source_id);

  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    source_file_id TEXT NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    start_offset INTEGER NOT NULL,
    end_offset INTEGER NOT NULL,
    token_estimate INTEGER NOT NULL,
    section TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_source_file ON chunks(source_file_id);
  CREATE INDEX IF NOT EXISTS idx_chunks_file_offset ON chunks(source_file_id, start_offset);
  CREATE INDEX IF NOT EXISTS idx_sources_location ON sources(location);

  CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
    content,
    content=chunks,
    content_rowid=rowid
  );

  CREATE TRIGGER IF NOT EXISTS chunks_fts_insert AFTER INSERT ON chunks
    BEGIN INSERT INTO chunks_fts(rowid, content) VALUES (new.rowid, new.content); END;

  CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks
    BEGIN INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content); END;

  CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
    id TEXT PRIMARY KEY,
    source_id TEXT,
    embedding float[768]
  );
`;
