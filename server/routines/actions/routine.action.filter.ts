import type { RoutineFilter } from "../routine.types";

export interface FilterableChat {
  id: string;
  name: string;
  archived: boolean;
  flagged: boolean;
  labels?: string[];
  updatedAt: string;
}

export function matchFilter(chats: FilterableChat[], filter: RoutineFilter): FilterableChat[] {
  return chats.filter((c) => {
    if (filter.archived !== undefined && c.archived !== filter.archived) return false;
    if (filter.flagged !== undefined && c.flagged !== filter.flagged) return false;
    if (filter.nameContains && !c.name.toLowerCase().includes(filter.nameContains.toLowerCase())) return false;
    if (filter.hasLabel && !(c.labels ?? []).includes(filter.hasLabel)) return false;
    if (filter.olderThan) {
      const cutoff = Date.now() - filter.olderThan * 24 * 60 * 60 * 1000;
      if (new Date(c.updatedAt).getTime() > cutoff) return false;
    }
    return true;
  });
}
