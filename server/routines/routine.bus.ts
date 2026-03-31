import { Cron } from "croner";
import type { EventBus } from "../core/bus";
import type { Logger } from "../logger.types";
import type { RoutineDb } from "../chat/chat.routine.db";
import { RoutineSchema } from "./routine.types";
import type { Routine } from "./routine.types";

function computeNextRun(cron: string): string | undefined {
  try {
    const job = new Cron(cron);
    const next = job.nextRun();
    return next ? next.toISOString() : undefined;
  } catch {
    return undefined;
  }
}

export function registerRoutineBus(
  bus: EventBus,
  db: RoutineDb,
  log: Logger,
  runRoutine?: (routine: Routine) => Promise<void>,
): void {
  bus.on("routine.list", () => {
    return { routines: db.listRoutines() };
  });

  bus.on("routine.get", (data: { id: string }) => {
    const routine = db.getRoutine(data.id);
    if (!routine) throw new Error(`Routine not found: ${data.id}`);
    const runs = db.getRoutineRuns(data.id);
    return { routine, runs };
  });

  bus.on("routine.create", (data: Omit<Routine, "createdAt" | "updatedAt" | "lastRun" | "nextRun">) => {
    const parsed = RoutineSchema.parse({
      ...data,
      nextRun: computeNextRun(data.cron),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    db.createRoutine(parsed);
    log.info("Routine created", { id: parsed.id, name: parsed.name, cron: parsed.cron });
    bus.emit("routine.updated", { routine: parsed });
    return { routine: parsed };
  });

  bus.on("routine.update", (data: { id: string } & Partial<Pick<Routine, "name" | "description" | "cron" | "once" | "action" | "enabled">>) => {
    const fields: Parameters<typeof db.updateRoutine>[1] = { ...data };
    if (data.cron) {
      fields.nextRun = computeNextRun(data.cron);
    }
    const routine = db.updateRoutine(data.id, fields);
    if (!routine) throw new Error(`Routine not found: ${data.id}`);
    log.info("Routine updated", { id: data.id });
    bus.emit("routine.updated", { routine });
    return { routine };
  });

  bus.on("routine.delete", (data: { id: string }) => {
    const deleted = db.deleteRoutine(data.id);
    if (!deleted) throw new Error(`Routine not found: ${data.id}`);
    log.info("Routine deleted", { id: data.id });
    bus.emit("routine.deleted", { id: data.id });
    return { deleted: true };
  });

  bus.on("routine.toggle", (data: { id: string; enabled: boolean }) => {
    const fields: Parameters<typeof db.updateRoutine>[1] = { enabled: data.enabled };
    if (data.enabled) {
      const existing = db.getRoutine(data.id);
      if (existing) fields.nextRun = computeNextRun(existing.cron);
    }
    const routine = db.updateRoutine(data.id, fields);
    if (!routine) throw new Error(`Routine not found: ${data.id}`);
    log.info("Routine toggled", { id: data.id, enabled: data.enabled });
    bus.emit("routine.updated", { routine });
    return { routine };
  });

  bus.on("routine.history", (data: { id: string; limit?: number }) => {
    return { runs: db.getRoutineRuns(data.id, data.limit) };
  });

  bus.on("routine.run", (data: { id: string }) => {
    const routine = db.getRoutine(data.id);
    if (!routine) throw new Error(`Routine not found: ${data.id}`);
    if (!runRoutine) throw new Error("Routine executor not available");
    runRoutine(routine).catch((err) => {
      log.error("Manual routine run failed", { id: data.id, error: String(err) });
    });
    return { runId: data.id };
  });
}
