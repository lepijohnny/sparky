import { Cron } from "croner";
import type { Logger } from "../logger.types";
import type { RoutineDb } from "../chat/chat.routine.db";
import type { Routine } from "./routine.types";

export interface RoutineScheduler {
  start(): void;
  stop(): void;
}

export function createRoutineScheduler(
  db: RoutineDb,
  runRoutine: (routine: Routine) => Promise<void>,
  log: Logger,
): RoutineScheduler {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function computeNextRun(cron: string): string | undefined {
    try {
      const job = new Cron(cron);
      const next = job.nextRun();
      return next ? next.toISOString() : undefined;
    } catch {
      return undefined;
    }
  }

  function tick() {
    try {
      const now = new Date();
      const routines = db.getEnabledRoutines();

      for (const routine of routines) {
        try {
          if (!routine.nextRun) {
            const next = computeNextRun(routine.cron);
            if (next) db.updateRoutine(routine.id, { nextRun: next });
            continue;
          }

          if (new Date(routine.nextRun) <= now) {
            log.info("Routine triggered", { id: routine.id, name: routine.name });

            runRoutine(routine).catch((err) => {
              log.error("Routine failed", { id: routine.id, error: String(err) });
            });

            const next = computeNextRun(routine.cron);
            if (routine.once) {
              db.updateRoutine(routine.id, { enabled: false, lastRun: now.toISOString(), nextRun: undefined });
            } else {
              db.updateRoutine(routine.id, { lastRun: now.toISOString(), nextRun: next });
            }
          }
        } catch (err) {
          log.error("Routine tick error", { id: routine.id, error: String(err) });
        }
      }
    } catch (err) {
      log.error("Routine scheduler tick failed", { error: String(err) });
    } finally {
      scheduleNext();
    }
  }

  function scheduleNext() {
    const now = Date.now();
    const msUntilNextMinute = 60000 - (now % 60000);
    timer = setTimeout(tick, msUntilNextMinute);
  }

  return {
    start() {
      log.info("Routine scheduler started");
      scheduleNext();
    },

    stop() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      log.info("Routine scheduler stopped");
    },
  };
}
