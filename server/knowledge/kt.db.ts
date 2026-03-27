import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import type { Logger } from "../logger.types";
import type { Source, SourceFile } from "./kt.types";
import { KT_SCHEMA } from "./kt.db.schema";

interface SourceRow {
  id: string;
  name: string;
  type: string;
  location: string;
  file_count: number;
  chunk_count: number;
  mode: string;
  status: string;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceFileRow {
  id: string;
  source_id: string;
  name: string;
  path: string;
  ext: string;
  size: number;
  chunk_count: number;
  status: string;
  error: string | null;
}

function toSource(row: SourceRow): Source {
  return {
    id: row.id,
    name: row.name,
    type: row.type as Source["type"],
    location: row.location,
    fileCount: row.file_count,
    chunkCount: row.chunk_count,
    mode: row.mode as Source["mode"],
    status: row.status as Source["status"],
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSourceFile(row: SourceFileRow): SourceFile {
  return {
    id: row.id,
    sourceId: row.source_id,
    name: row.name,
    path: row.path,
    ext: row.ext,
    size: row.size,
    chunkCount: row.chunk_count,
    status: row.status as SourceFile["status"],
    error: row.error ?? undefined,
  };
}

export function sanitizeForFts(query: string): string {
  const words = query
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  if (words.length === 0) return "";
  return words.join(" OR ");
}

function openDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  sqliteVec.load(db);
  db.pragma("foreign_keys = ON");
  db.exec(KT_SCHEMA);
  const cols = db.prepare("PRAGMA table_info(sources)").all() as { name: string }[];
  if (!cols.some((c) => c.name === "mode")) {
    db.exec("ALTER TABLE sources ADD COLUMN mode TEXT NOT NULL DEFAULT 'keyword' CHECK(mode IN ('keyword', 'hybrid'))");
  }
  db.exec("VACUUM");
  db.pragma("journal_mode = WAL");
  return db;
}

export interface KtDatabase {
  close(): void;
  reopen(dbPath: string): void;
  sourceExistsByLocation(location: string): boolean;
  countSources(): number;
  listSources(): Source[];
  getSource(id: string): Source | null;
  getSourceFiles(sourceId: string): SourceFile[];
  createSource(source: Source): void;
  updateSourceMode(id: string, mode: Source["mode"]): void;
  createSourceFile(file: SourceFile): void;
  updateSourceStatus(id: string, status: Source["status"], error?: string): void;
  updateSourceCounts(id: string): void;
  insertChunks(sourceFileId: string, chunks: { id: string; content: string; startOffset: number; endOffset: number; tokenEstimate: number; section?: string }[]): void;
  insertVectors(rows: { id: string; sourceId: string; vector: Float32Array }[]): void;
  deleteVectorsBySource(sourceId: string): void;
  searchVectors(queryVector: Float32Array, limit: number): { chunkId: string; sourceId: string; distance: number }[];
  updateSourceFileChunkCount(sourceFileId: string, count: number): void;
  deleteChunksBySource(sourceId: string): void;
  deleteSourceFiles(sourceId: string): void;
  transaction<T>(fn: () => T): T;
  updateSourceFileStatus(id: string, status: SourceFile["status"], error?: string): void;
  deleteSource(id: string): boolean;
  searchFts(query: string, limit: number): { chunkId: string; rank: number }[];
  getChunksBySourceIds(sourceIds: string[]): { id: string; sourceId: string; sourceFileName: string; content: string; section: string | null }[];
  getAdjacentChunks(chunkId: string): { id: string; sourceId: string; sourceFileName: string; content: string; section: string | null }[];
  getChunksByIds(ids: string[]): { id: string; sourceId: string; sourceFileName: string; content: string; section: string | null }[];
}

/** @deprecated Use KtDatabase instead */
export type KnowledgeDatabase = KtDatabase;

export function createKtDatabase(dbPath: string, log: Logger): KtDatabase {
  let db = openDb(dbPath);

  return {
    close() {
      db.close();
    },

    reopen(newPath) {
      db.close();
      db = openDb(newPath);
    },

    sourceExistsByLocation(location) {
      const row = db.prepare("SELECT id FROM sources WHERE location = :location LIMIT 1").get({ location }) as { id: string } | undefined;
      return !!row;
    },

    countSources() {
      const row = db.prepare("SELECT COUNT(*) as count FROM sources").get() as { count: number };
      return row?.count ?? 0;
    },

    listSources() {
      return (db.prepare("SELECT * FROM sources ORDER BY created_at DESC").all() as SourceRow[]).map(toSource);
    },

    getSource(id) {
      const row = db.prepare("SELECT * FROM sources WHERE id = :id").get({ id }) as SourceRow | undefined;
      return row ? toSource(row) : null;
    },

    getSourceFiles(sourceId) {
      return (db.prepare("SELECT * FROM source_files WHERE source_id = :sourceId ORDER BY name").all({ sourceId }) as SourceFileRow[]).map(toSourceFile);
    },

    createSource(source) {
      db.prepare(`
        INSERT INTO sources (id, name, type, location, file_count, chunk_count, mode, status, error, created_at, updated_at)
        VALUES (:id, :name, :type, :location, :file_count, :chunk_count, :mode, :status, :error, :created_at, :updated_at)
      `).run({
        id: source.id, name: source.name, type: source.type, location: source.location,
        file_count: source.fileCount, chunk_count: source.chunkCount, mode: source.mode,
        status: source.status, error: source.error ?? null, created_at: source.createdAt, updated_at: source.updatedAt,
      });
    },

    updateSourceMode(id, mode) {
      db.prepare("UPDATE sources SET mode = :mode WHERE id = :id").run({ id, mode });
    },

    createSourceFile(file) {
      db.prepare(`
        INSERT INTO source_files (id, source_id, name, path, ext, size, chunk_count, status, error)
        VALUES (:id, :source_id, :name, :path, :ext, :size, :chunk_count, :status, :error)
      `).run({
        id: file.id, source_id: file.sourceId, name: file.name, path: file.path,
        ext: file.ext, size: file.size, chunk_count: file.chunkCount, status: file.status, error: file.error ?? null,
      });
    },

    updateSourceStatus(id, status, error?) {
      const now = new Date().toISOString();
      db.prepare("UPDATE sources SET status = :status, error = :error, updated_at = :updated_at WHERE id = :id")
        .run({ id, status, error: error ?? null, updated_at: now });
    },

    updateSourceCounts(id) {
      const now = new Date().toISOString();
      db.prepare(`
        UPDATE sources SET
          file_count = (SELECT COUNT(*) FROM source_files WHERE source_id = :id),
          chunk_count = (SELECT COALESCE(SUM(chunk_count), 0) FROM source_files WHERE source_id = :id),
          updated_at = :now
        WHERE id = :id
      `).run({ id, now });
    },

    insertChunks(sourceFileId, chunks) {
      const insert = db.prepare(`
        INSERT INTO chunks (id, source_file_id, content, start_offset, end_offset, token_estimate, section)
        VALUES (:id, :source_file_id, :content, :start_offset, :end_offset, :token_estimate, :section)
      `);
      db.transaction(() => {
        for (const chunk of chunks) {
          insert.run({
            id: chunk.id, source_file_id: sourceFileId, content: chunk.content,
            start_offset: chunk.startOffset, end_offset: chunk.endOffset,
            token_estimate: chunk.tokenEstimate, section: chunk.section ?? null,
          });
        }
      })();
    },

    insertVectors(rows) {
      const insert = db.prepare("INSERT INTO vec_chunks (id, source_id, embedding) VALUES (:id, :source_id, :embedding)");
      db.transaction(() => {
        for (const row of rows) {
          insert.run({ id: row.id, source_id: row.sourceId, embedding: Buffer.from(row.vector.buffer) });
        }
      })();
    },

    deleteVectorsBySource(sourceId) {
      db.prepare("DELETE FROM vec_chunks WHERE source_id = :sourceId").run({ sourceId });
      const remaining = db.prepare("SELECT count(*) as cnt FROM vec_chunks").get() as { cnt: number };
      if (remaining.cnt === 0) {
        for (const t of ["vec_chunks_vector_chunks00", "vec_chunks_metadatachunks00", "vec_chunks_metadatatext00", "vec_chunks_chunks", "vec_chunks_rowids"]) {
          try { db.prepare(`DELETE FROM ${t}`).run(); } catch {}
        }
      }
    },

    searchVectors(queryVector, limit) {
      const rows = db.prepare(`
        SELECT id, source_id, distance FROM vec_chunks
        WHERE embedding MATCH :query ORDER BY distance LIMIT :limit
      `).all({ query: Buffer.from(queryVector.buffer), limit }) as { id: string; source_id: string; distance: number }[];
      return rows.map((r) => ({ chunkId: r.id, sourceId: r.source_id, distance: r.distance }));
    },

    updateSourceFileChunkCount(sourceFileId, count) {
      db.prepare("UPDATE source_files SET chunk_count = :count WHERE id = :id").run({ id: sourceFileId, count });
    },

    deleteChunksBySource(sourceId) {
      db.exec("DROP TRIGGER IF EXISTS chunks_fts_delete");
      db.prepare("DELETE FROM chunks WHERE source_file_id IN (SELECT id FROM source_files WHERE source_id = :sourceId)").run({ sourceId });
      try { db.prepare("INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')").run(); } catch {}
      db.exec(`CREATE TRIGGER IF NOT EXISTS chunks_fts_delete AFTER DELETE ON chunks
        BEGIN INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES ('delete', old.rowid, old.content); END`);
    },

    deleteSourceFiles(sourceId) {
      db.prepare("DELETE FROM source_files WHERE source_id = :sourceId").run({ sourceId });
    },

    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },

    updateSourceFileStatus(id, status, error?) {
      db.prepare("UPDATE source_files SET status = :status, error = :error WHERE id = :id").run({ id, status, error: error ?? null });
    },

    deleteSource(id) {
      db.prepare("DELETE FROM sources WHERE id = :id").run({ id });
      return true;
    },

    searchFts(query, limit) {
      const sanitized = sanitizeForFts(query);
      if (!sanitized) return [];
      const rows = db.prepare(`
        SELECT c.id, f.rank FROM chunks_fts f
        JOIN chunks c ON c.rowid = f.rowid
        WHERE chunks_fts MATCH :query ORDER BY f.rank LIMIT :limit
      `).all({ query: sanitized, limit }) as { id: string; rank: number }[];
      return rows.map((r) => ({ chunkId: r.id, rank: r.rank }));
    },

    getChunksBySourceIds(sourceIds) {
      if (sourceIds.length === 0) return [];
      const placeholders = sourceIds.map(() => "?").join(",");
      const rows = db.prepare(`
        SELECT c.id, sf.source_id, sf.name AS source_file_name, c.content, c.section
        FROM chunks c JOIN source_files sf ON sf.id = c.source_file_id
        WHERE sf.source_id IN (${placeholders})
      `).all(...sourceIds) as { id: string; source_id: string; source_file_name: string; content: string; section: string | null }[];
      return rows.map((r) => ({ id: r.id, sourceId: r.source_id, sourceFileName: r.source_file_name, content: r.content, section: r.section }));
    },

    getAdjacentChunks(chunkId) {
      const rows = db.prepare(`
        WITH target AS (
          SELECT source_file_id, start_offset FROM chunks WHERE id = :id
        ),
        neighbors AS (
          SELECT c.id, c.content, c.section, c.start_offset, sf.source_id, sf.name AS source_file_name
          FROM chunks c JOIN source_files sf ON sf.id = c.source_file_id
          WHERE c.source_file_id = (SELECT source_file_id FROM target)
          ORDER BY c.start_offset
        ),
        ranked AS (
          SELECT *, ROW_NUMBER() OVER (ORDER BY start_offset) AS rn FROM neighbors
        )
        SELECT id, source_id, source_file_name, content, section FROM ranked
        WHERE rn BETWEEN (SELECT rn - 1 FROM ranked WHERE id = :id) AND (SELECT rn + 1 FROM ranked WHERE id = :id)
      `).all({ id: chunkId }) as { id: string; source_id: string; source_file_name: string; content: string; section: string | null }[];
      return rows.map((r) => ({ id: r.id, sourceId: r.source_id, sourceFileName: r.source_file_name, content: r.content, section: r.section }));
    },

    getChunksByIds(ids) {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => "?").join(",");
      const rows = db.prepare(`
        SELECT c.id, sf.source_id, sf.name AS source_file_name, c.content, c.section
        FROM chunks c JOIN source_files sf ON sf.id = c.source_file_id
        WHERE c.id IN (${placeholders})
      `).all(...ids) as { id: string; source_id: string; source_file_name: string; content: string; section: string | null }[];
      return rows.map((r) => ({ id: r.id, sourceId: r.source_id, sourceFileName: r.source_file_name, content: r.content, section: r.section }));
    },
  };
}
