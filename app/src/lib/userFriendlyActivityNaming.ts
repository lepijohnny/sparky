export function humanizeServiceId(id: string): string {
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function parseSvcTarget(target: string): { kind: "call" | "describe"; service: string } | null {
  if (target.startsWith("svc.call:")) {
    return { kind: "call", service: target.slice("svc.call:".length) };
  }
  if (target.startsWith("svc.describe:")) {
    return { kind: "describe", service: target.slice("svc.describe:".length) };
  }
  return null;
}

function humanizeEvent(event: string): string {
  const parts = event.split(".");
  const action = parts.pop() ?? "";
  const subject = parts.pop() ?? "";
  const verb = action.charAt(0).toUpperCase() + action.slice(1);
  const noun = subject.charAt(0).toUpperCase() + subject.slice(1);
  return noun ? `${verb} ${noun}` : verb;
}

export function humanizeToolTargetName(tool?: string, target?: string): string {
  if (!target) return tool ?? "action";

  if (tool === "app_bash") {
    return target.length > 60 ? `${target.slice(0, 57)}...` : target;
  }

  if (tool === "app_bus_emit") {
    const parsed = parseSvcTarget(target);
    if (parsed) {
      const serviceName = humanizeServiceId(parsed.service);
      return parsed.kind === "call" ? `Calling ${serviceName}` : `Exploring ${serviceName}`;
    }
    return humanizeEvent(target);
  }

  if (tool === "app_read") return `Read ${target}`;
  if (tool === "app_write") return `Write ${target}`;
  if (tool === "app_edit") return `Edit ${target}`;
  if (tool === "app_web_read") return `Fetch ${target}`;
  if (tool === "app_web_search") return `Search "${target}"`;

  return target;
}
