import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { migrate } from "../workspace.db.schema";

const TMP = join(import.meta.dirname, ".tmp-migration-test");

describe("schema migration", () => {
  let db: Database.Database;

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    db = new Database(join(TMP, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(TMP, { recursive: true, force: true });
  });

  test("given fresh database, when migrated, then schema version is set", () => {
    migrate(db);
    const row = db.prepare("SELECT version FROM schema_version").get() as { version: number };
    expect(row.version).toBeGreaterThanOrEqual(1);
  });

  test("given fresh database, when migrated, then chats table has mode column", () => {
    migrate(db);
    const cols = db.prepare("PRAGMA table_info(chats)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("mode");
  });

  test("given already migrated database, when migrated again, then idempotent", () => {
    migrate(db);
    const v1 = (db.prepare("SELECT version FROM schema_version").get() as { version: number }).version;
    migrate(db);
    const v2 = (db.prepare("SELECT version FROM schema_version").get() as { version: number }).version;
    expect(v2).toBe(v1);
  });

  test("given v0 database without mode column, when migrated, then mode column is added", () => {
    db.exec(`
      CREATE TABLE schema_version (version INTEGER NOT NULL);
      INSERT INTO schema_version (version) VALUES (0);
      CREATE TABLE chats (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    `);
    migrate(db);
    const cols = db.prepare("PRAGMA table_info(chats)").all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain("mode");
    const row = db.prepare("SELECT version FROM schema_version").get() as { version: number };
    expect(row.version).toBe(4);
  });
});
