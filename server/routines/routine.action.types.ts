import type { EventBus } from "../core/bus";
import type { RoutineDb } from "../chat/chat.routine.db";
import type { Routine, RoutineRun } from "./routine.types";

export interface ActionContext {
  bus: EventBus;
  db: RoutineDb;
  routine: Routine;
  run: RoutineRun;
}

export type ActionFn = (ctx: ActionContext) => Promise<void>;
