import type { ServiceInfo } from "../types/service";
import type { Skill } from "../types/skill";

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

/** Match skill names in a message and return their IDs. */
export function resolveSkillMentions(message: string, skills: Skill[]): string[] {
  const active = skills.filter((s) => s.state === "active");
  if (active.length === 0) return [];
  const lower = message.toLowerCase().replace(/@/g, "");
  const sorted = [...active].sort((a, b) => b.name.length - a.name.length);
  const matched: string[] = [];
  let remaining = lower;

  for (const skill of sorted) {
    const name = skill.name.toLowerCase();
    const id = skill.id.toLowerCase();
    if (remaining.includes(name)) {
      matched.push(skill.id);
      remaining = remaining.replace(name, "");
    } else if (remaining.includes(id)) {
      matched.push(skill.id);
      remaining = remaining.replace(id, "");
    }
  }

  return matched;
}
