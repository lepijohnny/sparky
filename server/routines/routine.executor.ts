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

export function createRoutineExecutor(bus: EventBus, db: RoutineDb, log: Logger) {
  return async function execute(routine: Routine): Promise<void> {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();

    const run: RoutineRun = {
      id: runId,
      routineId: routine.id,
      status: "running",
      startedAt,
    };
    db.addRoutineRun(run);

    try {
      const handler = actions[routine.action.type];
      if (!handler) throw new Error(`Unknown action type: ${routine.action.type}`);
      await handler({ bus, db, routine, run });

      const finishedAt = new Date().toISOString();
      db.updateRoutineRun(runId, {
        status: "done",
        finishedAt,
        durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      });
      log.info("Routine completed", { id: routine.id, runId });
    } catch (err) {
      const finishedAt = new Date().toISOString();
      db.updateRoutineRun(runId, {
        status: "error",
        error: String(err),
        finishedAt,
        durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
      });
      log.error("Routine failed", { id: routine.id, runId, error: String(err) });
    }
  };
}
