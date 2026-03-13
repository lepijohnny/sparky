#!/usr/bin/env tsx
/**
 * Parses bus.types.ts and connection.api.ts to generate api.md
 * Run: npx tsx server/core/assistant/assistant.apiparser.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const busTypesPath = join(dir, "..", "bus.types.ts");
const apiPath = join(dir, "..", "connection.api.ts");
const outPath = join(dir, "api.md");

const busSource = readFileSync(busTypesPath, "utf-8");
const apiSource = readFileSync(apiPath, "utf-8");

const TYPE_SOURCES = [
  readFileSync(join(dir, "..", "..", "settings", "labels.types.ts"), "utf-8"),
  readFileSync(join(dir, "..", "..", "settings", "llm.types.ts"), "utf-8"),
  readFileSync(join(dir, "..", "..", "settings", "workspace.types.ts"), "utf-8"),
  readFileSync(join(dir, "..", "..", "settings", "appearance.types.ts"), "utf-8"),
  readFileSync(join(dir, "..", "registry.types.ts"), "utf-8"),
  readFileSync(join(dir, "..", "..", "chat", "chat.types.ts"), "utf-8"),
  readFileSync(join(dir, "..", "..", "settings", "environment.types.ts"), "utf-8"),
].join("\n");

function extractApiEvents(): string[] {
  const match = apiSource.match(/new Set<keyof BusEventMap>\(\[([\s\S]*?)\]\)/);
  if (!match) throw new Error("Could not parse API set");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function extractInterfaces(): Map<string, string> {
  const types = new Map<string, string>();
  const regex = /export interface (\w+)\s*\{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null = regex.exec(TYPE_SOURCES);
  while (m !== null) {
    const name = m[1];
    const body = m[2];
    const fields = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("/*") && !l.startsWith("*") && !l.startsWith("//"))
      .map((l) => {
        const fm = l.match(/^(\w+\??)\s*:\s*(.+?);?\s*$/);
        return fm ? `${fm[1]}: ${fm[2].replace(/;$/, "")}` : null;
      })
      .filter(Boolean)
      .join(", ");
    types.set(name, `{ ${fields} }`);
    m = regex.exec(TYPE_SOURCES);
  }
  return types;
}

function resolveType(raw: string, types: Map<string, string>): string {
  let resolved = raw.trim();

  // Resolve Omit<Type, "key1" | "key2">
  resolved = resolved.replace(/Omit<(\w+),\s*([^>]+)>/g, (_, base, keys) => {
    const info = types.get(base);
    if (!info) return base;
    const omitKeys = keys.replace(/['"]/g, "").split("|").map((k: string) => k.trim());
    const fields = info.slice(2, -2).split(",").map((f: string) => f.trim())
      .filter((f: string) => !omitKeys.some((k: string) => f.startsWith(k)));
    return `{ ${fields.join(", ")} }`;
  });

  // Resolve named types
  for (const [name, expanded] of types) {
    resolved = resolved.replace(new RegExp(`\\b${name}\\b`, "g"), expanded);
  }

  return resolved;
}

interface EventSig {
  event: string;
  req: string;
  res: string;
}

function parseBusEvents(events: string[]): EventSig[] {
  const types = extractInterfaces();
  const sigs: EventSig[] = [];

  // Parse each line of BusEventMap
  const mapMatch = busSource.match(/export interface BusEventMap\s*\{([\s\S]*?)^\}/m);
  if (!mapMatch) throw new Error("Could not find BusEventMap");

  const entries = new Map<string, { req: string; res: string }>();
  const lines = mapMatch[1].split("\n");

  for (const line of lines) {
    const m = line.match(/"([^"]+)"\s*:\s*\{\s*req:\s*(.*?);\s*res:\s*(.*?)\s*\}/);
    if (!m) continue;
    entries.set(m[1], { req: m[2].trim(), res: m[3].trim() });
  }

  for (const event of events) {
    const entry = entries.get(event);
    if (!entry) {
      sigs.push({ event, req: "void", res: "void" });
      continue;
    }
    sigs.push({
      event,
      req: entry.req === "void" ? "void" : resolveType(entry.req, types),
      res: entry.res === "void" ? "void" : resolveType(entry.res, types),
    });
  }

  return sigs;
}

function groupByDomain(sigs: EventSig[]): Map<string, EventSig[]> {
  const groups = new Map<string, EventSig[]>();
  for (const sig of sigs) {
    const parts = sig.event.split(".");
    const domain = (parts[0] === "settings" || parts[0] === "core")
      ? `${parts[0]}.${parts[1]}`
      : parts[0];
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain)!.push(sig);
  }
  return groups;
}

function balanceBraces(s: string): string {
  let depth = 0;
  for (const ch of s) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  while (depth > 0) { s += " }"; depth--; }
  return s;
}

function generateMarkdown(groups: Map<string, EventSig[]>): string {
  const lines: string[] = ["# API Reference", ""];

  for (const [domain, sigs] of groups) {
    lines.push(`## ${domain}`, "");
    for (const sig of sigs) {
      lines.push(`### \`${sig.event}\``);
      if (sig.req !== "void") lines.push(`- **params**: \`${balanceBraces(sig.req)}\``);
      if (sig.res !== "void") lines.push(`- **returns**: \`${balanceBraces(sig.res)}\``);
      lines.push("");
    }
  }

  return lines.join("\n");
}

const events = extractApiEvents();
const sigs = parseBusEvents(events);
const groups = groupByDomain(sigs);
const md = generateMarkdown(groups);

writeFileSync(outPath, md);
console.log(`Generated ${outPath} (${events.length} events)`);
