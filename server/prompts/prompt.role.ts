import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export type ChatRole = "sparky" | "connect" | "trust" | string;

export interface RoleMeta {
  tools: string[];
  knowledge: boolean;
  anchors: boolean;
  summary: boolean;
  formats: boolean;
  services: boolean;
  version: string;
}

export interface RoleDef {
  name: string;
  meta: RoleMeta;
  prompt: string;
}

const DEFAULT_META: RoleMeta = {
  tools: [],
  knowledge: false,
  anchors: false,
  summary: false,
  formats: false,
  services: false,
  version: "0.0.0",
};

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = THIS_DIR.endsWith("prompts") ? THIS_DIR : join(THIS_DIR, "prompts");

function readText(path: string): string {
  return readFileSync(path, "utf-8").replace(/\r\n/g, "\n");
}

export function promptsDir(): string {
  return PROMPTS_DIR;
}

/** Role name aliases: old name → new folder name */
const ROLE_ALIASES: Record<string, string> = {
  connection: "connect",
  permissions: "trust",
};

function parseYamlValue(raw: string): unknown {
  const val = raw.trim();
  if (val === "true") return true;
  if (val === "false") return false;
  if (val.startsWith("[") && val.endsWith("]")) {
    try { return JSON.parse(val); } catch { return val.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean); }
  }
  return val;
}

function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let nested: Record<string, unknown> | null = null;

  for (const line of text.split("\n")) {
    const nestedMatch = line.match(/^  (\w[\w-]*):\s*(.*)$/);
    if (nestedMatch && currentKey && nested) {
      nested[nestedMatch[1]] = parseYamlValue(nestedMatch[2]);
      continue;
    }

    if (nested && currentKey) {
      result[currentKey] = nested;
      nested = null;
      currentKey = null;
    }

    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    if (rawVal.trim() === "") {
      currentKey = key;
      nested = {};
    } else {
      result[key] = parseYamlValue(rawVal);
    }
  }

  if (nested && currentKey) {
    result[currentKey] = nested;
  }

  return result;
}

function parseAgentFile(content: string): { meta: RoleMeta; prompt: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: { ...DEFAULT_META }, prompt: content.trim() };

  try {
    const parsed = parseSimpleYaml(match[1]);
    const metadata = (typeof parsed.metadata === "object" && parsed.metadata !== null ? parsed.metadata : {}) as Record<string, unknown>;

    const toolsRaw = parsed["allowed-tools"];
    const tools = typeof toolsRaw === "string" ? toolsRaw.split(/\s+/).filter(Boolean)
      : Array.isArray(toolsRaw) ? toolsRaw as string[]
      : DEFAULT_META.tools;

    const meta: RoleMeta = {
      tools,
      knowledge: typeof metadata.knowledge === "boolean" ? metadata.knowledge : DEFAULT_META.knowledge,
      anchors: typeof metadata.anchors === "boolean" ? metadata.anchors : DEFAULT_META.anchors,
      summary: typeof metadata.summary === "boolean" ? metadata.summary : DEFAULT_META.summary,
      formats: typeof metadata.formats === "boolean" ? metadata.formats : DEFAULT_META.formats,
      services: typeof metadata.services === "boolean" ? metadata.services : DEFAULT_META.services,
      version: typeof metadata.version === "string" ? metadata.version : DEFAULT_META.version,
    };
    return { meta, prompt: match[2].trim() };
  } catch {
    return { meta: { ...DEFAULT_META }, prompt: content.trim() };
  }
}

const cache = new Map<string, RoleDef>();

export function loadRole(name: string): RoleDef {
  const resolved = ROLE_ALIASES[name] ?? name;
  const cached = cache.get(resolved);
  if (cached) return cached;

  const agentFile = join(PROMPTS_DIR, resolved, "AGENT.md");
  if (existsSync(agentFile)) {
    const content = readText(agentFile);
    const { meta, prompt } = parseAgentFile(content);
    const def: RoleDef = { name: resolved, meta, prompt };
    cache.set(resolved, def);
    return def;
  }

  return { name, meta: { ...DEFAULT_META }, prompt: "You are a helpful assistant." };
}

export function readPromptFile(path: string): string {
  return readText(join(PROMPTS_DIR, path));
}

export function clearRoleCache(): void {
  cache.clear();
}

export function listRoles(): string[] {
  try {
    return readdirSync(PROMPTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(PROMPTS_DIR, d.name, "AGENT.md")))
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export function buildRolePrompt(role: RoleDef, preferences: string, mode?: string, chatId?: string): string {
  let prompt = role.prompt;

  prompt += `\n\n## System\n- Platform: ${process.platform}\n- Home: ${homedir()}\n- CWD: ${process.cwd()}`;
  if (chatId) prompt += `\n- ChatId: ${chatId}`;
  if (mode) {
    const desc = mode === "read" ? "read-only (no file writes or shell commands)"
      : mode === "write" ? "read + write (no shell commands)"
      : "full access (read, write, shell commands)";
    prompt += `\n- Mode: ${mode} — ${desc}`;
  }

  if (preferences) {
    prompt += `\n\nHere are some details about the user: ${preferences}`;
  }

  if (role.meta.formats) {
    prompt += `\n\nRich formats: \`\`\`echart (ECharts JSON), \`\`\`mermaid, and LaTeX (\$...\$ inline, \$\$...\$\$ display). Read \`sparky/references/formats/<name>.md\` before first use.`;
  }

  return prompt;
}
