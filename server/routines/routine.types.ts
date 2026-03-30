import { z } from "zod";

export const RoutineFilterSchema = z.object({
  olderThan: z.number().optional(),
  nameContains: z.string().optional(),
  hasLabel: z.string().optional(),
  archived: z.boolean().optional(),
  flagged: z.boolean().optional(),
});

export const ChatActionSchema = z.object({
  type: z.literal("chat"),
  prompt: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
  role: z.string().optional(),
});

export const ArchiveActionSchema = z.object({
  type: z.literal("archive"),
  filter: RoutineFilterSchema,
});

export const FlagActionSchema = z.object({
  type: z.literal("flag"),
  flag: z.boolean(),
  filter: RoutineFilterSchema,
});

export const LabelActionSchema = z.object({
  type: z.literal("label"),
  labelId: z.string(),
  remove: z.boolean().optional(),
  filter: RoutineFilterSchema,
});

export const RoutineActionSchema = z.discriminatedUnion("type", [
  ChatActionSchema,
  ArchiveActionSchema,
  FlagActionSchema,
  LabelActionSchema,
]);

export const RoutineSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  cron: z.string().min(1),
  once: z.boolean().optional(),
  action: RoutineActionSchema,
  enabled: z.boolean(),
  lastRun: z.string().optional(),
  nextRun: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Routine = z.infer<typeof RoutineSchema>;
export type RoutineAction = z.infer<typeof RoutineActionSchema>;
export type RoutineFilter = z.infer<typeof RoutineFilterSchema>;

export const RoutineRunSchema = z.object({
  id: z.string(),
  routineId: z.string(),
  chatId: z.string().optional(),
  status: z.enum(["running", "done", "error"]),
  error: z.string().optional(),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  durationMs: z.number().optional(),
});

export type RoutineRun = z.infer<typeof RoutineRunSchema>;
