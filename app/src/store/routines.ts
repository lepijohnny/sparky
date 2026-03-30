import type { StateCreator } from "zustand";

export interface Routine {
  id: string;
  name: string;
  description?: string;
  cron: string;
  once?: boolean;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface RoutineRun {
  id: string;
  chatId?: string;
  status: "running" | "done" | "error";
  error?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface RoutinesSlice {
  routines: Routine[];
  routineRuns: Record<string, RoutineRun[]>;
  selectedRoutineId: string | null;
  setRoutines: (routines: Routine[]) => void;
  patchRoutine: (routine: Routine) => void;
  removeRoutine: (id: string) => void;
  selectRoutine: (id: string | null) => void;
  setRoutineRuns: (id: string, runs: RoutineRun[]) => void;
}

export const createRoutinesSlice: StateCreator<RoutinesSlice> = (set) => ({
  routines: [],
  routineRuns: {},
  selectedRoutineId: null,
  setRoutines: (routines) => set({ routines }),
  patchRoutine: (routine) => set((s) => {
    const idx = s.routines.findIndex((r) => r.id === routine.id);
    if (idx >= 0) {
      if (JSON.stringify(s.routines[idx]) === JSON.stringify(routine)) return s;
      const next = [...s.routines];
      next[idx] = routine;
      return { routines: next };
    }
    return { routines: [routine, ...s.routines] };
  }),
  removeRoutine: (id) => set((s) => ({
    routines: s.routines.filter((r) => r.id !== id),
    routineRuns: (() => { const { [id]: _, ...rest } = s.routineRuns; return rest; })(),
    selectedRoutineId: s.selectedRoutineId === id ? null : s.selectedRoutineId,
  })),
  selectRoutine: (id) => set({ selectedRoutineId: id }),
  setRoutineRuns: (id, runs) => set((s) => ({ routineRuns: { ...s.routineRuns, [id]: runs } })),
});
