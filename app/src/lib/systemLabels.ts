export const SYSTEM_LABELS: Record<string, string> = {
  _connection: "Connection",
  _permission: "Permission",
  _skill: "Skill",
  _routine: "Routine",
};

export function isSystemLabel(id: string): boolean {
  return id.startsWith("_");
}

export function getSystemLabelName(id: string): string | null {
  return SYSTEM_LABELS[id] ?? null;
}
