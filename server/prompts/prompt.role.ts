import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

export type ChatRole = "sparky" | "connection" | string;

export interface RoleMeta {
  tools: string[];
  knowledge: boolean;
  anchors: boolean;
  summary: boolean;
  formats: boolean;
  services: boolean;
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
};

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = THIS_DIR.endsWith("prompts") ? THIS_DIR : join(THIS_DIR, "prompts");

function readText(path: string): string {
  return readFileSync(path, "utf-8").replace(/\r\n/g, "\n");
}

export function promptsDir(): string {
  return PROMPTS_DIR;
}
const BUILTIN_FORMATS = ["latex", "mermaid", "echart"];

function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (!m) continue;
    const [, key, raw] = m;
    const val = raw.trim();
    if (val === "true") result[key] = true;
    else if (val === "false") result[key] = false;
    else if (val.startsWith("[") && val.endsWith("]")) {
      try {
        result[key] = JSON.parse(val);
      } catch {
        result[key] = val.slice(1, -1).split(",").map((s) => s.trim()).filter(Boolean);
      }
    } else result[key] = val;
  }
  return result;
}

function parseRoleFile(content: string): { meta: RoleMeta; prompt: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: { ...DEFAULT_META }, prompt: content.trim() };

  try {
    const parsed = parseSimpleYaml(match[1]);
    const meta: RoleMeta = {
      tools: Array.isArray(parsed.tools) ? parsed.tools as string[] : DEFAULT_META.tools,
      knowledge: typeof parsed.knowledge === "boolean" ? parsed.knowledge : DEFAULT_META.knowledge,
      anchors: typeof parsed.anchors === "boolean" ? parsed.anchors : DEFAULT_META.anchors,
      summary: typeof parsed.summary === "boolean" ? parsed.summary : DEFAULT_META.summary,
      formats: typeof parsed.formats === "boolean" ? parsed.formats : DEFAULT_META.formats,
      services: typeof parsed.services === "boolean" ? parsed.services : DEFAULT_META.services,
    };
    return { meta, prompt: match[2].trim() };
  } catch {
    return { meta: { ...DEFAULT_META }, prompt: content.trim() };
  }
}

const cache = new Map<string, RoleDef>();

export function loadRole(name: string): RoleDef {
  const cached = cache.get(name);
  if (cached) return cached;

  const file = join(PROMPTS_DIR, "roles", `${name}.md`);
  try {
    const content = readText(file);
    const { meta, prompt } = parseRoleFile(content);
    const def: RoleDef = { name, meta, prompt };
    cache.set(name, def);
    return def;
  } catch {
    const def: RoleDef = { name, meta: { ...DEFAULT_META }, prompt: "You are a helpful assistant." };
    return def;
  }
}

export function readPromptFile(path: string): string {
  return readText(join(PROMPTS_DIR, path));
}

export function clearRoleCache(): void {
  cache.clear();
}

export function listRoles(): string[] {
  try {
    return readdirSync(join(PROMPTS_DIR, "roles"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

let cachedFormats: { names: string[]; content: string } | null = null;

function loadFormats(): { names: string[]; content: string } {
  if (cachedFormats) return cachedFormats;
  const dir = join(PROMPTS_DIR, "formats");
  try {
    const allFiles = readdirSync(dir).filter((f) => f.endsWith(".md"));
    const allNames = allFiles.map((f) => f.replace(/\.md$/, ""));
    const builtinFiles = allFiles.filter((f) => BUILTIN_FORMATS.includes(f.replace(/\.md$/, "")));
    cachedFormats = {
      names: allNames,
      content: builtinFiles.map((f) => readText(join(dir, f))).join("\n\n"),
    };
  } catch {
    cachedFormats = { names: [], content: "" };
  }
  return cachedFormats;
}

export function buildRolePrompt(role: RoleDef, preferences: string): string {
  let prompt = role.prompt;

  prompt += `\n\n## System\n- Platform: ${process.platform}\n- Home: ${homedir()}\n- CWD: ${process.cwd()}`;

  if (preferences) {
    prompt += `\n\nHere are some details about the user: ${preferences}`;
  }

  if (role.meta.formats) {
    const formats = loadFormats();
    if (formats.content) prompt += `\n\n${formats.content}`;

    const extraFormats = formats.names.filter((n) => !BUILTIN_FORMATS.includes(n));
    if (extraFormats.length > 0) {
      prompt += `\n\nAdditional rendering formats are available: ${extraFormats.join(", ")}. Call \`app_read("formats/${extraFormats[0]}.md")\` to get the syntax before using them.`;
    }
  }

  return prompt;
}
