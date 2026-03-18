import type { ChatActivity } from "../types/chat";

export function truncate(s: string, max = 64): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function inputField(input: unknown, key: string): unknown {
  if (input != null && typeof input === "object") {
    return (input as Record<string, unknown>)[key];
  }
  return undefined;
}

export function toolLabel(name: string, input: unknown): string {
  if (name === "app_bus_emit") {
    const event = String(inputField(input, "event") ?? "");
    return event || "Bus event";
  }
  if (name === "web_search" || name === "app_web_search") {
    const query = String(inputField(input, "query") ?? "");
    return query ? `web search: ${query}` : "web search";
  }
  return name;
}

export function getActivityLabel(activity: ChatActivity): string | null {
  switch (activity.type) {
    case "agent.start":
    case "agent.thinking.done":
      return null;

    case "agent.thinking.start":
      return "Thinking";

    case "agent.tool.start":
      return activity.data.summary || toolLabel(activity.data.name, activity.data.input);

    case "agent.tool.result":
      return activity.data.summary ?? truncate(String(activity.data.output));

    case "agent.tool.denied":
      return `Tool denied: ${activity.data.id}`;

    case "agent.approval.requested":
      return `Approval required: ${activity.data.message}`;

    case "agent.approval.approved":
      return `Approved: ${activity.data.tool}:${activity.data.target}`;

    case "agent.approval.denied":
      return `Denied: ${activity.data.tool}:${activity.data.target}${activity.data.reason === "timeout" ? " (timeout)" : ""}`;

    case "agent.trust.denied":
      return `Blocked: ${activity.data.rule ?? activity.data.target}`;

    case "agent.knowledge":
      return activity.data.summary ?? `${activity.data.sources.length} sources`;

    case "agent.error":
      return `Error: ${activity.data.message}`;

    default:
      return `${activity.source}:${activity.type}`;
  }
}

/**
 * Merge consecutive tool.start + tool.result pairs into a single display row.
 * The merged row uses the result's type/data (has summary + category) with the start's name.
 */
export function mergeToolActivities(activities: ChatActivity[]): ChatActivity[] {
  const merged: ChatActivity[] = [];
  const resultById = new Map<string, ChatActivity>();

  for (const a of activities) {
    if (a.type === "agent.tool.result" && a.data?.id) {
      resultById.set(a.data.id, a);
    }
  }

  for (const a of activities) {
    if (a.type === "agent.tool.start" && a.data?.id && resultById.has(a.data.id)) {
      const result = resultById.get(a.data.id)!;
      const label = toolLabel(a.data.name, a.data.input);
      const summary = result.data?.summary ?? truncate(String(result.data?.output));
      merged.push({
        ...result,
        data: { ...result.data, mergedLabel: `${label} → ${summary}` },
      });
      continue;
    }
    if (a.type === "agent.tool.result" && a.data?.id) {
      const hasMatchingStart = activities.some((s) => s.type === "agent.tool.start" && s.data?.id === a.data.id);
      if (hasMatchingStart) continue;
    }
    merged.push(a);
  }
  return merged;
}

/**
 * Filter out hidden activities (internal types + hidden tool names).
 */
export function filterActivities(activities: ChatActivity[]): ChatActivity[] {
  const HIDDEN_TYPES = new Set(["agent.start", "agent.thinking.start", "agent.thinking.delta", "agent.thinking.done"]);
  return activities.filter((a) => !HIDDEN_TYPES.has(a.type));
}

/** Module-level expanded state — survives component remounts. */
export const expandedGroups = new Set<string>();
