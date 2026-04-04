import type { ChatActivity } from "../types/chat";
import { humanizeToolTargetName } from "./userFriendlyActivityNaming";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) ?? null;
  } catch { /* */ }
  return null;
}

function renderResultList(items: any[]): string {
  const parts: string[] = [];
  parts.push(`<div style="margin:0;padding:0">`);
  for (let i = 0; i < items.length; i++) {
    const r = items[i];
    const title = r.title ?? r.question ?? r.name ?? "";
    const url = r.url ?? r.link ?? "";
    const desc = r.description ?? r.answer ?? r.snippet ?? "";
    const age = r.age ?? "";
    const stripped = desc.replace(/<[^>]*>/g, "");
    const isLast = i === items.length - 1;

    parts.push(`<div style="display:flex;gap:12px;padding:0 0 ${isLast ? "0" : "10px"} 0">`);
    parts.push(`<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:24px">`);
    parts.push(`<span style="color:var(--accent);font-weight:700;font-size:12px;line-height:20px">${i + 1}</span>`);
    if (!isLast) parts.push(`<div style="flex:1;width:1px;background:color-mix(in srgb, var(--fg-muted) 12%, transparent);margin-top:4px"></div>`);
    parts.push(`</div>`);
    parts.push(`<div style="min-width:0;padding-bottom:${isLast ? "0" : "10px"};${isLast ? "" : "border-bottom:1px solid rgba(128,128,128,0.06);"}">`);
    parts.push(`<div style="font-weight:600">${escapeHtml(title)}</div>`);
    if (url) parts.push(`<div style="font-size:11px;opacity:0.4;margin:2px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(url)}</div>`);
    if (stripped) parts.push(`<div style="margin-top:4px;opacity:0.8">${escapeHtml(stripped)}</div>`);
    if (age) parts.push(`<div style="font-size:11px;opacity:0.35;margin-top:4px">${escapeHtml(age)}</div>`);
    parts.push(`</div>`);
    parts.push(`</div>`);
  }
  parts.push(`</div>`);
  return parts.join("\n");
}

function parseTextSearchResults(text: string): { query: string; items: any[] } | null {
  const headerMatch = text.match(/^Web search results for query: "(.+?)"\s*\n/);
  if (!headerMatch) return null;
  const query = headerMatch[1];
  const items: any[] = [];
  const entryRegex = /^\d+\.\s+\*\*(.+?)\*\*\n\s+(\S+)\n\s+([\s\S]*?)(?=\n\n\d+\.\s+\*\*|\nREMINDER:|$)/gm;
  let m;
  while ((m = entryRegex.exec(text)) !== null) {
    items.push({ title: m[1], url: m[2], description: m[3].trim() });
  }
  return items.length > 0 ? { query, items } : null;
}

function renderSearchResults(data: any): string | null {
  const sections: { label: string; items: any[] }[] = [];

  const web = data?.web?.results;
  if (Array.isArray(web) && web.length > 0) sections.push({ label: "Web Results", items: web });

  const news = data?.news?.results;
  if (Array.isArray(news) && news.length > 0) sections.push({ label: "News", items: news });

  const faq = data?.faq?.results;
  if (Array.isArray(faq) && faq.length > 0) sections.push({ label: "FAQ", items: faq });

  const flat = data?.results;
  if (Array.isArray(flat) && flat.length > 0 && sections.length === 0) sections.push({ label: "Results", items: flat });

  if (sections.length === 0) return null;

  const query = data?.query?.original ?? data?.query?.altered ?? "";
  const parts: string[] = [];

  if (query) parts.push(`<h2 style="margin:0 0 12px">${escapeHtml(query)}</h2>`);

  for (const s of sections) {
    if (sections.length > 1) {
      parts.push(`<div style="font-weight:600;margin:16px 0 8px;opacity:0.6;font-size:12px;text-transform:uppercase">${escapeHtml(s.label)} (${s.items.length})</div>`);
    }
    parts.push(renderResultList(s.items));
  }

  return parts.join("\n");
}

function gutterHtml(num: string, gutterWidth: number): string {
  return `<span style="user-select:none;color:var(--accent);opacity:0.5;min-width:${gutterWidth + 1}ch;text-align:right;padding:0 12px;flex-shrink:0">${num}</span>`
    + `<span style="width:1px;flex-shrink:0;background:color-mix(in srgb, var(--accent) 35%, transparent)"></span>`;
}

function jsonToLineNumberedHtml(json: string): string {
  const lines = json.split("\n");
  const gw = String(lines.length).length;
  const rows = lines.map((line, i) => {
    const num = String(i + 1).padStart(gw, " ");
    return `<div style="display:flex">${gutterHtml(num, gw)}<span style="padding-left:14px">${escapeHtml(line)}</span></div>`;
  });
  return `<pre style="padding:12px 0">${rows.join("")}</pre>`;
}

function highlightLine(line: string): string {
  const e = escapeHtml(line);
  return e
    .replace(/^(#{1,4}\s.*)$/, '<span style="color:var(--accent);font-weight:600">$1</span>')
    .replace(/(\*\*(.+?)\*\*)/g, '<span style="font-weight:600">$1</span>')
    .replace(/(`[^`]+`)/g, '<span style="color:#e06c75">$1</span>')
    .replace(/(https?:\/\/\S+)/g, '<span style="color:var(--accent);opacity:0.8">$1</span>')
    .replace(/^(\s*- )/, '<span style="opacity:0.4">$1</span>')
    .replace(/^(```\w*)$/, '<span style="opacity:0.4">$1</span>');
}

function textToLineNumberedHtml(text: string): string {
  const lines = text.split("\n");
  const gw = String(lines.length).length;
  const rows = lines.map((line, i) => {
    const num = String(i + 1).padStart(gw, " ");
    return `<div style="display:flex">${gutterHtml(num, gw)}<span style="padding-left:14px">${highlightLine(line)}</span></div>`;
  });
  return `<pre style="padding:12px 0">${rows.join("")}</pre>`;
}

function deepParseJson(text: string): unknown | null {
  let parsed = tryParseJson(text);
  while (typeof parsed === "string") {
    parsed = tryParseJson(parsed);
  }
  return typeof parsed === "object" ? parsed : null;
}

export function formatActivityContent(activity: ChatActivity): { content: string; format: "html" } {
  const d = activity.data ?? {};
  const name = d.mergedLabel ?? d.name ?? activity.type;
  const output = d.output;
  const outputStr = typeof output === "string" ? output : output != null ? JSON.stringify(output) : "";

  const parsed = outputStr ? deepParseJson(outputStr) : null;

  const parts: string[] = [];

  parts.push(`<div style="opacity:0.5;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Action</div>`);
  parts.push(`<h2 style="margin:0 0 16px">${escapeHtml(String(name))}</h2>`);

  if (d.input) {
    parts.push(`<div style="opacity:0.5;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Input</div>`);
    parts.push(jsonToLineNumberedHtml(JSON.stringify(d.input, null, 2)));
  }

  if (outputStr) {
    parts.push(`<div style="opacity:0.5;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;margin:16px 0 4px">Output</div>`);

    if (parsed) {
      const search = renderSearchResults(parsed);
      if (search) {
        parts.push(search);
      } else {
        parts.push(jsonToLineNumberedHtml(JSON.stringify(parsed, null, 2)));
      }
    } else {
      parts.push(textToLineNumberedHtml(outputStr));
    }
  }

  return { content: parts.join("\n"), format: "html" };
}

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

export function humanizeToolTarget(tool?: string, target?: string): string {
  return humanizeToolTargetName(tool, target);
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

    case "user.steering":
      return `Steer: ${activity.data?.content ?? "Steering message"}`;

    default:
      return `${activity.source}:${activity.type}`;
  }
}



function extractDescription(name: string, output: unknown): string | null {
  if (!output) return null;
  const text = String(output);

  if (name === "app_web_search") {
    const links = text.match(/\*\*(.+?)\*\*/g);
    if (links && links.length > 0) {
      const titles = links.slice(0, 3).map((l) => l.replace(/\*\*/g, ""));
      const more = links.length > 3 ? ` +${links.length - 3} more` : "";
      return truncate(`${titles.join(", ")}${more}`, 80);
    }
    return null;
  }

  if (name === "app_web_read") {
    const first = text.split("\n").find((l) => l.trim().length > 20);
    return first ? truncate(first.trim(), 72) : null;
  }

  if (name === "app_bus_emit") {
    if (text.length > 10 && text.length < 200) return truncate(text, 72);
    return null;
  }

  if (name === "app_read" || name === "app_grep" || name === "app_glob") {
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length > 0) return truncate(`${lines.length} lines`, 40);
    return null;
  }

  return null;
}

export function mergeToolActivities(activities: ChatActivity[]): ChatActivity[] {
  const merged: ChatActivity[] = [];
  const resultById = new Map<string, ChatActivity>();

  for (const a of activities) {
    if (a.type === "agent.tool.result" && a.data?.id) {
      resultById.set(a.data.id, a);
    }
  }

  for (const a of activities) {
    if (a.type === "agent.tool.start" && a.data?.id) {
      const result = resultById.get(a.data.id);
      if (result) {
        const label = a.data.friendly ?? a.data.label ?? a.data.name;
        const description = extractDescription(a.data.name, result.data?.output);
        merged.push({
          ...result,
          data: { ...result.data, icon: a.data.icon, mergedLabel: label, description },
        });
      } else {
        const label = a.data.friendly ?? a.data.label ?? a.data.name;
        merged.push({
          ...a,
          data: { ...a.data, mergedLabel: label, pending: true },
        });
      }
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
