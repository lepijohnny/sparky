import { randomUUID } from "node:crypto";
import type { EventBus } from "../core/bus";
import type { Logger } from "../logger.types";
import type { RoutineDb } from "../chat/chat.routine.db";
import type { Routine, RoutineRun } from "./routine.types";
import type { ActionFn } from "./routine.action.types";
import { execute as chat } from "./actions/routine.action.chat";
import { execute as archive } from "./actions/routine.action.archive";
import { execute as flag } from "./actions/routine.action.flag";
import { execute as label } from "./actions/routine.action.label";

const actions: Record<string, ActionFn> = { chat, archive, flag, label };

const RETRY_DELAYS = [30_000, 60_000, 120_000];
const MAX_ROUTINE_DURATION = 10 * 60_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRoutineExecutor(bus: EventBus, db: RoutineDb, log: Logger) {
  return async function execute(routine: Routine): Promise<void> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const startMs = Date.now();

    const run: RoutineRun = {
      id: runId,
      routineId: routine.id,
      status: "running",
      startedAt,
    };
    db.addRoutineRun(run);

    const handler = actions[routine.action.type];
    if (!handler) {
      db.updateRoutineRun(runId, { status: "error", error: `Unknown action type: ${routine.action.type}`, finishedAt: new Date().toISOString(), durationMs: 0 });
      return;
    }

    let lastError: string | undefined;

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        await handler({ bus, db, routine, run });

        const finishedAt = new Date().toISOString();
        db.updateRoutineRun(runId, {
          status: "done",
          finishedAt,
          durationMs: Date.now() - startMs,
        });
        if (attempt > 0) log.info("Routine succeeded after retry", { id: routine.id, runId, attempt });
        else log.info("Routine completed", { id: routine.id, runId });
        return;
      } catch (err) {
        lastError = String(err);
        const elapsed = Date.now() - startMs;

        if (attempt < RETRY_DELAYS.length && elapsed < MAX_ROUTINE_DURATION) {
          const delay = RETRY_DELAYS[attempt];
          log.warn("Routine attempt failed, retrying", { id: routine.id, runId, attempt: attempt + 1, delay, error: lastError });
          await sleep(delay);
        }
      }
    }

    const finishedAt = new Date().toISOString();
    db.updateRoutineRun(runId, {
      status: "error",
      error: lastError,
      finishedAt,
      durationMs: Date.now() - startMs,
    });
    log.error("Routine failed after all retries", { id: routine.id, runId, error: lastError });
  };
}
