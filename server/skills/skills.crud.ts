import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { EventBus } from "../core/bus";
import type { Logger } from "../logger.types";
import type { StorageProvider } from "../core/storage";
import { invalidateSkillCache } from "./skills";
import type { SkillBin, SkillEnvVar, SkillEnvGroup, SkillRequirements, SkillInfo, SkillFileEntry } from "./skills";

const execFileAsync = promisify(execFile);

const SKILLS = "skills";

function skillPath(slug: string, ...parts: string[]): string {
  return [SKILLS, slug, ...parts].join("/");
}

function parseSkillFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w[\w-]*):\s*(.+)$/);
    if (m) result[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return result;
}

const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".toml",
  ".py", ".sh", ".bash", ".zsh", ".fish",
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs",
  ".html", ".css", ".xml", ".svg",
  ".env", ".ini", ".cfg", ".conf",
  ".rs", ".go", ".rb", ".lua",
]);

function collectFiles(storage: StorageProvider, dir: string, prefix: string, out: { name: string; content: string }[]): void {
  const entries = storage.listDir(dir);
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of sorted) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.name === "node_modules") continue;
    if (!prefix && entry.name === "requirements.json") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory) {
      collectFiles(storage, full, rel, out);
    } else {
      const ext = "." + entry.name.split(".").pop()?.toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      try {
        out.push({ name: rel, content: storage.readText(full) });
      } catch (err) {
        console.debug("skill load error", err);
      }
    }
  }
}

function readTree(storage: StorageProvider, dir: string): SkillFileEntry[] {
  const entries = storage.listDir(dir);
  const result: SkillFileEntry[] = [];
  for (const entry of entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (entry.isDirectory) {
      result.push({ name: entry.name, isDir: true, children: readTree(storage, `${dir}/${entry.name}`) });
    } else {
      result.push({ name: entry.name, isDir: false });
    }
  }
  return result;
}

async function isBinInstalled(name: string): Promise<boolean> {
  try {
    await execFileAsync("which", [name]);
    return true;
  } catch {
    return false;
  }
}

function loadRequirementsSync(storage: StorageProvider, slug: string, envVars: Record<string, string>): { req: SkillRequirements | null; binChecks: Promise<{ name: string; installed: boolean }[]> } {
  const reqPath = skillPath(slug, "requirements.json");
  if (!storage.exists(reqPath)) return { req: null, binChecks: Promise.resolve([]) };

  try {
    const raw = storage.read<any>(reqPath);
    const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";

    const binDefs = (raw.bins ?? []) as any[];
    const binChecks = Promise.all(binDefs.map(async (b: any) => ({
      name: b.name,
      install: typeof b.install === "object" ? (b.install[platform] ?? b.install.macos ?? "") : (b.install ?? ""),
      required: b.required !== false,
      installed: await isBinInstalled(b.name),
    })));

    const env: SkillEnvVar[] = [];
    for (const e of raw.env ?? []) {
      env.push({
        name: e.name,
        required: e.required !== false,
        group: e.group,
        hint: e.hint,
        present: !!(envVars[e.name] || process.env[e.name]),
      });
    }

    const groups: Record<string, SkillEnvGroup> = {};
    for (const [key, g] of Object.entries(raw.groups ?? {})) {
      const groupDef = g as { min?: number; hint?: string };
      const groupVars = env.filter((e) => e.group === key);
      const presentCount = groupVars.filter((e) => e.present).length;
      groups[key] = {
        min: groupDef.min ?? 1,
        hint: groupDef.hint,
        satisfied: presentCount >= (groupDef.min ?? 1),
      };
    }

    return {
      req: { bins: [], env, groups, safe: raw.safe === true, notes: raw.notes ?? "" },
      binChecks,
    };
  } catch {
    return { req: null, binChecks: Promise.resolve([]) };
  }
}

async function loadSkill(storage: StorageProvider, slug: string, envVars: Record<string, string>): Promise<SkillInfo | null> {
  const dir = skillPath(slug);
  const skillFile = skillPath(slug, "SKILL.md");
  const agentFile = skillPath(slug, "AGENT.md");

  let mdPath: string | null = null;
  if (storage.exists(skillFile)) mdPath = skillFile;
  else if (storage.exists(agentFile)) mdPath = agentFile;
  else return null;

  const content = storage.readText(mdPath);
  const fm = parseSkillFrontmatter(content);
  const files = readTree(storage, dir);

  let source = "created";
  const metaPath = skillPath(slug, "_meta.json");
  if (storage.exists(metaPath)) {
    try {
      const meta = storage.read<any>(metaPath);
      if (meta.slug) source = "clawhub";
    } catch (err) {
      console.debug("skill load error", err);
    }
  }

  const { req, binChecks } = loadRequirementsSync(storage, slug, envVars);
  const resolvedBins = await binChecks;
  const requirements = req ? { ...req, bins: resolvedBins } : null;

  let state = "pending";
  if (requirements) {
    state = requirements.safe ? "verified" : "rejected";
  }

  const binsMissing = requirements ? requirements.bins.some((b) => b.required && !b.installed) : false;
  const secretsMissing = requirements ? (
    requirements.env.some((e) => e.required && !e.group && !e.present) ||
    Object.values(requirements.groups).some((g) => !g.satisfied)
  ) : false;

  const statePath = skillPath(slug, "_state.json");
  if (storage.exists(statePath)) {
    try {
      const saved = storage.read<any>(statePath);
      if (saved.state === "active" && state !== "rejected" && !binsMissing && !secretsMissing) state = "active";
    } catch (err) {
      console.debug("skill load error", err);
    }
  }

  return {
    id: slug,
    name: fm.name ?? slug,
    description: fm.description ?? "",
    version: fm.version ?? "",
    license: fm.license ?? "",
    author: fm["author"] ?? "",
    icon: fm["icon"] ?? "",
    state,
    source,
    files,
    requirements,
    binsMissing,
    secretsMissing,
  };
}

async function listSkills(storage: StorageProvider, getEnvVars: (skillId?: string) => Record<string, string>): Promise<SkillInfo[]> {
  if (!storage.exists(SKILLS)) return [];
  const entries = storage.listDir(SKILLS);
  const skills: SkillInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory || entry.name.startsWith(".")) continue;
    const skill = await loadSkill(storage, entry.name, getEnvVars(entry.name));
    if (skill) skills.push(skill);
  }
  return skills;
}

const SkillId = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "Slug must be lowercase alphanumeric with hyphens"),
});

const SkillCreate = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "Slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).describe("Display name"),
  content: z.string().min(1, "SKILL.md content is required"),
});

const SkillStateSet = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/, "Slug must be lowercase alphanumeric with hyphens"),
  state: z.enum(["active", "verified", "rejected", "pending"]).describe("Target state"),
});

export function registerSkillsBus(bus: EventBus, log: Logger, storage: StorageProvider, getEnvVars: (skillId?: string) => Record<string, string>, broadcast: (route: string, data: unknown) => void): void {
  bus.on("skills.list", async () => {
    const skills = await listSkills(storage, getEnvVars);
    return { skills };
  });

  bus.on("skills.get", async (data) => {
    const { id } = SkillId.parse(data);
    const skill = await loadSkill(storage, id, getEnvVars(id));
    if (!skill) throw new Error(`Skill not found: ${id}`);
    const files: { name: string; content: string }[] = [];
    collectFiles(storage, skillPath(id), "", files);
    const skillIdx = files.findIndex((f) => f.name === "SKILL.md" || f.name === "AGENT.md");
    if (skillIdx > 0) {
      const [sf] = files.splice(skillIdx, 1);
      files.unshift(sf);
    }
    return { skill, files };
  });

  bus.on("skills.activate", async (data) => {
    const { id } = SkillId.parse(data);
    const dir = skillPath(id);
    if (!storage.exists(dir)) throw new Error(`Skill not found: ${id}`);
    storage.write(skillPath(id, "_state.json"), { state: "active" });
    const skill = await loadSkill(storage, id, getEnvVars(id));
    log.info("Skill activated", { id });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  bus.on("skills.deactivate", async (data) => {
    const { id } = SkillId.parse(data);
    const dir = skillPath(id);
    if (!storage.exists(dir)) throw new Error(`Skill not found: ${id}`);
    const statePath = skillPath(id, "_state.json");
    if (storage.exists(statePath)) storage.remove(statePath);
    const skill = await loadSkill(storage, id, getEnvVars(id));
    log.info("Skill deactivated", { id });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  bus.on("skills.state.set", async (data) => {
    const { id, state } = SkillStateSet.parse(data);
    const dir = skillPath(id);
    if (!storage.exists(dir)) throw new Error(`Skill not found: ${id}`);
    if (state === "active") {
      storage.write(skillPath(id, "_state.json"), { state: "active" });
    } else {
      const statePath = skillPath(id, "_state.json");
      if (storage.exists(statePath)) storage.remove(statePath);
    }
    const skill = await loadSkill(storage, id, getEnvVars(id));
    log.info("Skill state set", { id, state });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  bus.on("skills.delete", async (data) => {
    const { id } = SkillId.parse(data);
    const dir = skillPath(id);
    if (!storage.exists(dir)) throw new Error(`Skill not found: ${id}`);
    storage.remove(dir);
    log.info("Skill deleted", { id });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { ok: true };
  });

  bus.on("skills.create", async (data) => {
    const { id, name, content } = SkillCreate.parse(data);
    storage.writeText(skillPath(id, "SKILL.md"), content);
    const skill = await loadSkill(storage, id, getEnvVars(id));
    log.info("Skill created", { id, name });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  log.info("Skills bus registered");
}
