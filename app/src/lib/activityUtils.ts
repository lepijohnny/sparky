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

const BUS_LABELS: Record<string, string> = {
  chat: "Chat",
  settings: "Settings",
  trust: "Permissions",
  skills: "Skills",
  svc: "Service",
  web: "Web",
  core: "App",
};

function busLabel(event: string): string {
  const domain = event.split(".")[0];
  return BUS_LABELS[domain] ?? domain.charAt(0).toUpperCase() + domain.slice(1);
}

function humanizeEvent(event: string): string {
  const parts = event.split(".");
  const action = parts.pop() ?? "";
  const subject = parts.pop() ?? "";
  const verb = action.charAt(0).toUpperCase() + action.slice(1);
  const noun = subject.charAt(0).toUpperCase() + subject.slice(1);
  return noun ? `${verb} ${noun}` : verb;
}

export function humanizeToolTarget(tool?: string, target?: string): string {
  if (!target) return tool ?? "action";
  if (tool === "app_bash") return target.length > 60 ? `${target.slice(0, 57)}...` : target;
  if (tool === "app_bus_emit") return humanizeEvent(target);
  if (tool === "app_read") return `Read ${target}`;
  if (tool === "app_write") return `Write ${target}`;
  if (tool === "app_edit") return `Edit ${target}`;
  if (tool === "app_web_read") return `Fetch ${target}`;
  if (tool === "app_web_search") return `Search "${target}"`;
  return target;
}

export function toolLabel(name: string, input: unknown, label?: string): string {
  if (name === "app_bus_emit") {
    const event = String(inputField(input, "event") ?? "");
    return event ? busLabel(event) : label || "App";
  }
  if (label) return label;
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
      return activity.data.summary || toolLabel(activity.data.name, activity.data.input, activity.data.label);

    case "agent.tool.result":
      return activity.data.summary ?? truncate(String(activity.data.output));

    case "agent.tool.denied":
      return `Tool denied: ${activity.data.id}`;

    case "agent.approval.requested":
      return `Approval: ${humanizeToolTarget(activity.data.tool, activity.data.target)}`;

    case "agent.approval.approved":
      return `Approved: ${humanizeToolTarget(activity.data.tool, activity.data.target)}`;

    case "agent.approval.denied":
      return `Denied: ${humanizeToolTarget(activity.data.tool, activity.data.target)}${activity.data.reason === "timeout" ? " (timeout)" : ""}`;

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
      const displayLabel = toolLabel(a.data.name, a.data.input, a.data.label);
      const summary = result.data?.summary ?? truncate(String(result.data?.output));
      merged.push({
        ...result,
        data: { ...result.data, icon: a.data.icon, mergedLabel: `${displayLabel} → ${summary}` },
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
