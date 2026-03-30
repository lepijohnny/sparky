import type Database from "better-sqlite3";
import { RoutineActionSchema } from "./routine.types";
import type { Routine, RoutineRun } from "./routine.types";

interface RoutineRow {
  id: string;
  name: string;
  description: string | null;
  cron: string;
  once: number;
  action: string;
  enabled: number;
  last_run: string | null;
  next_run: string | null;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  routine_id: string;
  chat_id: string | null;
  status: string;
  error: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
}

function toRoutine(row: RoutineRow): Routine {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    cron: row.cron,
    once: row.once === 1 ? true : undefined,
    action: RoutineActionSchema.parse(JSON.parse(row.action)),
    enabled: row.enabled === 1,
    lastRun: row.last_run ?? undefined,
    nextRun: row.next_run ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRun(row: RunRow): RoutineRun {
  return {
    id: row.id,
    routineId: row.routine_id,
    chatId: row.chat_id ?? undefined,
    status: row.status as RoutineRun["status"],
    error: row.error ?? undefined,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  };
}

export interface RoutineDatabase {
  list(): Routine[];
  get(id: string): Routine | null;
  create(routine: Routine): void;
  update(id: string, fields: Partial<Pick<Routine, "name" | "description" | "cron" | "once" | "action" | "enabled" | "lastRun" | "nextRun">>): Routine | null;
  delete(id: string): boolean;
  getEnabled(): Routine[];
  addRun(run: RoutineRun): void;
  updateRun(id: string, fields: Partial<Pick<RoutineRun, "status" | "error" | "chatId" | "finishedAt" | "durationMs">>): void;
  getRuns(routineId: string, limit?: number): RoutineRun[];
}

export function createRoutineDatabase(db: Database.Database): RoutineDatabase {
  const sql = {
    list: db.prepare("SELECT * FROM routines ORDER BY created_at DESC"),
    get: db.prepare("SELECT * FROM routines WHERE id = :id"),
    create: db.prepare(`
      INSERT INTO routines (id, name, description, cron, once, action, enabled, last_run, next_run, created_at, updated_at)
      VALUES (:id, :name, :description, :cron, :once, :action, :enabled, :last_run, :next_run, :created_at, :updated_at)
    `),
    update: db.prepare(`
      UPDATE routines SET name = :name, description = :description, cron = :cron, once = :once,
        action = :action, enabled = :enabled, last_run = :last_run, next_run = :next_run, updated_at = :updated_at
      WHERE id = :id
    `),
    delete: db.prepare("DELETE FROM routines WHERE id = :id"),
    getEnabled: db.prepare("SELECT * FROM routines WHERE enabled = 1"),
    addRun: db.prepare(`
      INSERT INTO routine_runs (id, routine_id, chat_id, status, error, started_at, finished_at, duration_ms)
      VALUES (:id, :routine_id, :chat_id, :status, :error, :started_at, :finished_at, :duration_ms)
    `),
    updateRun: db.prepare(`
      UPDATE routine_runs SET status = :status, error = :error, chat_id = :chat_id, finished_at = :finished_at, duration_ms = :duration_ms
      WHERE id = :id
    `),
    getRuns: db.prepare("SELECT * FROM routine_runs WHERE routine_id = :routine_id ORDER BY started_at DESC LIMIT :limit"),
  };

  return {
    list() {
      return (sql.list.all() as RoutineRow[]).map(toRoutine);
    },

    get(id) {
      const row = sql.get.get({ id }) as RoutineRow | undefined;
      return row ? toRoutine(row) : null;
    },

    create(routine) {
      sql.create.run({
        id: routine.id,
        name: routine.name,
        description: routine.description ?? null,
        cron: routine.cron,
        once: routine.once ? 1 : 0,
        action: JSON.stringify(routine.action),
        enabled: routine.enabled ? 1 : 0,
        last_run: routine.lastRun ?? null,
        next_run: routine.nextRun ?? null,
        created_at: routine.createdAt,
        updated_at: routine.updatedAt,
      });
    },

    update(id, fields) {
      const existing = this.get(id);
      if (!existing) return null;
      const merged = { ...existing, ...fields };
      sql.update.run({
        id,
        name: merged.name,
        description: merged.description ?? null,
        cron: merged.cron,
        once: merged.once ? 1 : 0,
        action: JSON.stringify(merged.action),
        enabled: merged.enabled ? 1 : 0,
        last_run: merged.lastRun ?? null,
        next_run: merged.nextRun ?? null,
        updated_at: new Date().toISOString(),
      });
      return this.get(id);
    },

    delete(id) {
      return sql.delete.run({ id }).changes > 0;
    },

    getEnabled() {
      return (sql.getEnabled.all() as RoutineRow[]).map(toRoutine);
    },

    addRun(run) {
      sql.addRun.run({
        id: run.id,
        routine_id: run.routineId,
        chat_id: run.chatId ?? null,
        status: run.status,
        error: run.error ?? null,
        started_at: run.startedAt,
        finished_at: run.finishedAt ?? null,
        duration_ms: run.durationMs ?? null,
      });
    },

    updateRun(id, fields) {
      const row = db.prepare("SELECT * FROM routine_runs WHERE id = :id").get({ id }) as RunRow | undefined;
      if (!row) return;
      sql.updateRun.run({
        id,
        status: fields.status ?? row.status,
        error: fields.error ?? row.error,
        chat_id: fields.chatId ?? row.chat_id,
        finished_at: fields.finishedAt ?? row.finished_at,
        duration_ms: fields.durationMs ?? row.duration_ms,
      });
    },

    getRuns(routineId, limit = 20) {
      return (sql.getRuns.all({ routine_id: routineId, limit }) as RunRow[]).map(toRun);
    },
  };
}
