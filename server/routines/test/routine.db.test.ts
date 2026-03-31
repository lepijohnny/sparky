import { describe, test, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { migrate } from "../../workspace.db.schema";
import { createRoutineDb, type RoutineDb } from "../../chat/chat.routine.db";
import type { Routine, RoutineRun } from "../routine.types";

const TMP = join(import.meta.dirname, ".tmp-routine-test");

function makeRoutine(overrides?: Partial<Routine>): Routine {
  return {
    id: crypto.randomUUID(),
    name: "Test Routine",
    cron: "0 9 * * *",
    action: { type: "chat", prompt: "Hello" },
    enabled: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeRun(routineId: string, overrides?: Partial<RoutineRun>): RoutineRun {
  return {
    id: crypto.randomUUID(),
    routineId,
    status: "running",
    startedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("routine db", () => {
  let db: Database.Database;
  let routineDb: RoutineDb;

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    db = new Database(join(TMP, "test.db"));
    migrate(db);
    routineDb = createRoutineDb(db);
  });

  afterEach(() => {
    db.close();
    rmSync(TMP, { recursive: true, force: true });
  });

  test("given no routines, when listRoutines, then returns empty array", () => {
    expect(routineDb.listRoutines()).toEqual([]);
  });

  test("given a routine, when createRoutine and getRoutine, then returns the routine", () => {
    const r = makeRoutine({ name: "Morning Email" });
    routineDb.createRoutine(r);
    const found = routineDb.getRoutine(r.id);
    expect(found).not.toBeNull();
    expect(found!.name).toBe("Morning Email");
    expect(found!.cron).toBe("0 9 * * *");
    expect(found!.action).toEqual({ type: "chat", prompt: "Hello" });
    expect(found!.enabled).toBe(true);
  });

  test("given a routine, when listRoutines, then includes it", () => {
    const r = makeRoutine();
    routineDb.createRoutine(r);
    const list = routineDb.listRoutines();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(r.id);
  });

  test("given a routine, when updateRoutine, then fields are updated", () => {
    const r = makeRoutine();
    routineDb.createRoutine(r);
    const updated = routineDb.updateRoutine(r.id, { name: "Updated", cron: "0 8 * * 1-5" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Updated");
    expect(updated!.cron).toBe("0 8 * * 1-5");
  });

  test("given a routine, when deleteRoutine, then it is gone", () => {
    const r = makeRoutine();
    routineDb.createRoutine(r);
    expect(routineDb.deleteRoutine(r.id)).toBe(true);
    expect(routineDb.getRoutine(r.id)).toBeNull();
    expect(routineDb.listRoutines()).toEqual([]);
  });

  test("given nonexistent id, when deleteRoutine, then returns false", () => {
    expect(routineDb.deleteRoutine("nope")).toBe(false);
  });

  test("given nonexistent id, when updateRoutine, then returns null", () => {
    expect(routineDb.updateRoutine("nope", { name: "x" })).toBeNull();
  });

  test("given enabled and disabled routines, when getEnabledRoutines, then returns only enabled", () => {
    const r1 = makeRoutine({ enabled: true });
    const r2 = makeRoutine({ enabled: false });
    routineDb.createRoutine(r1);
    routineDb.createRoutine(r2);
    const enabled = routineDb.getEnabledRoutines();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].id).toBe(r1.id);
  });

  test("given a routine, when toggle enabled, then state changes", () => {
    const r = makeRoutine({ enabled: true });
    routineDb.createRoutine(r);
    routineDb.updateRoutine(r.id, { enabled: false });
    expect(routineDb.getRoutine(r.id)!.enabled).toBe(false);
    expect(routineDb.getEnabledRoutines()).toHaveLength(0);
  });

  test("given a routine with archive action, when stored and retrieved, then action is correct", () => {
    const r = makeRoutine({
      action: { type: "archive", filter: { olderThan: 30, archived: false } },
    });
    routineDb.createRoutine(r);
    const found = routineDb.getRoutine(r.id);
    expect(found!.action).toEqual({ type: "archive", filter: { olderThan: 30, archived: false } });
  });

  test("given a routine with once flag, when stored and retrieved, then once is true", () => {
    const r = makeRoutine({ once: true });
    routineDb.createRoutine(r);
    expect(routineDb.getRoutine(r.id)!.once).toBe(true);
  });
});

describe("routine runs", () => {
  let db: Database.Database;
  let routineDb: RoutineDb;
  let routineId: string;

  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
    db = new Database(join(TMP, "test.db"));
    migrate(db);
    routineDb = createRoutineDb(db);
    const r = makeRoutine();
    routineId = r.id;
    routineDb.createRoutine(r);
  });

  afterEach(() => {
    db.close();
    rmSync(TMP, { recursive: true, force: true });
  });

  test("given no runs, when getRoutineRuns, then returns empty array", () => {
    expect(routineDb.getRoutineRuns(routineId)).toEqual([]);
  });

  test("given a run, when addRoutineRun and getRoutineRuns, then returns the run", () => {
    const run = makeRun(routineId);
    routineDb.addRoutineRun(run);
    const runs = routineDb.getRoutineRuns(routineId);
    expect(runs).toHaveLength(1);
    expect(runs[0].id).toBe(run.id);
    expect(runs[0].status).toBe("running");
  });

  test("given a running run, when updateRoutineRun to done, then status and duration are set", () => {
    const run = makeRun(routineId);
    routineDb.addRoutineRun(run);
    routineDb.updateRoutineRun(run.id, {
      status: "done",
      finishedAt: new Date().toISOString(),
      durationMs: 1234,
    });
    const runs = routineDb.getRoutineRuns(routineId);
    expect(runs[0].status).toBe("done");
    expect(runs[0].durationMs).toBe(1234);
  });

  test("given a running run, when updateRoutineRun to error, then error message is stored", () => {
    const run = makeRun(routineId);
    routineDb.addRoutineRun(run);
    routineDb.updateRoutineRun(run.id, {
      status: "error",
      error: "Something went wrong",
      finishedAt: new Date().toISOString(),
    });
    const runs = routineDb.getRoutineRuns(routineId);
    expect(runs[0].status).toBe("error");
    expect(runs[0].error).toBe("Something went wrong");
  });

  test("given a run, when updateRoutineRun with chatId, then chatId is stored", () => {
    const run = makeRun(routineId);
    routineDb.addRoutineRun(run);
    const chatId = crypto.randomUUID();
    routineDb.updateRoutineRun(run.id, { chatId });
    const runs = routineDb.getRoutineRuns(routineId);
    expect(runs[0].chatId).toBe(chatId);
  });

  test("given multiple runs, when getRoutineRuns with limit, then returns limited results", () => {
    for (let i = 0; i < 5; i++) {
      routineDb.addRoutineRun(makeRun(routineId));
    }
    expect(routineDb.getRoutineRuns(routineId, 3)).toHaveLength(3);
    expect(routineDb.getRoutineRuns(routineId)).toHaveLength(5);
  });

  test("given runs for different routines, when getRoutineRuns, then returns only matching", () => {
    const r2 = makeRoutine();
    routineDb.createRoutine(r2);
    routineDb.addRoutineRun(makeRun(routineId));
    routineDb.addRoutineRun(makeRun(r2.id));
    expect(routineDb.getRoutineRuns(routineId)).toHaveLength(1);
    expect(routineDb.getRoutineRuns(r2.id)).toHaveLength(1);
  });
});
