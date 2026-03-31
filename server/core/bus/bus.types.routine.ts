import type { Routine, RoutineRun } from "../../routines/routine.types";

export interface RoutineEvents {
  "routine.list":    { req: void; res: { routines: Routine[] } };
  "routine.get":     { req: { id: string }; res: { routine: Routine; runs: RoutineRun[] } };
  "routine.create":  { req: { id: string; name: string; description?: string; cron: string; once?: boolean; action: Routine["action"]; enabled: boolean }; res: { routine: Routine } };
  "routine.update":  { req: { id: string; name?: string; description?: string; cron?: string; once?: boolean; action?: Routine["action"]; enabled?: boolean }; res: { routine: Routine } };
  "routine.delete":  { req: { id: string }; res: { deleted: boolean } };
  "routine.toggle":  { req: { id: string; enabled: boolean }; res: { routine: Routine } };
  "routine.history": { req: { id: string; limit?: number }; res: { runs: RoutineRun[] } };
  "routine.run":     { req: { id: string }; res: { runId: string } };

  "routine.updated": { req: { routine: Routine }; res: void };
  "routine.deleted": { req: { id: string }; res: void };
}
