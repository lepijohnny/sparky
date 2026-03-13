import type { ServiceInfo } from "../types/service";

/** Match service labels in a message and return their IDs.
 *  Longest labels are matched first to avoid partial overlaps.
 */
export function resolveServiceMentions(message: string, services: ServiceInfo[]): string[] {
  if (services.length === 0) return [];
  const lower = message.toLowerCase().replace(/@/g, "");
  const sorted = [...services].sort((a, b) => b.label.length - a.label.length);
  const matched: string[] = [];
  let remaining = lower;

  for (const svc of sorted) {
    const label = svc.label.toLowerCase();
    if (remaining.includes(label)) {
      matched.push(svc.id);
      remaining = remaining.replace(label, "");
    }
  }

  return matched;
}
