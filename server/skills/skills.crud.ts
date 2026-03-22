import { readdir, readFile, stat, writeFile, rm, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { existsSync } from "node:fs";
import type { EventBus } from "../core/bus";
import type { Logger } from "../logger.types";
import { SKILLS_DIR, invalidateSkillCache } from "./skills";
import type { SkillBin, SkillEnvVar, SkillEnvGroup, SkillRequirements, SkillInfo, SkillFileEntry } from "./skills";

const execFileAsync = promisify(execFile);

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

async function collectFiles(dirPath: string, prefix: string, out: { name: string; content: string }[]): Promise<void> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const sorted = entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  for (const entry of sorted) {
    if (entry.name.startsWith(".") || entry.name.startsWith("_") || entry.name === "node_modules") continue;
    if (!prefix && entry.name === "requirements.json") continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await collectFiles(join(dirPath, entry.name), rel, out);
    } else {
      const ext = "." + entry.name.split(".").pop()?.toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext)) continue;
      try {
        const content = await readFile(join(dirPath, entry.name), "utf-8");
        out.push({ name: rel, content });
      } catch (err) { console.debug("skill load error", err); }
    }
  }
}

async function readTree(dirPath: string): Promise<SkillFileEntry[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const result: SkillFileEntry[] = [];
  for (const entry of entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (entry.isDirectory()) {
      const children = await readTree(join(dirPath, entry.name));
      result.push({ name: entry.name, isDir: true, children });
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

async function loadRequirements(dir: string, envVars: Record<string, string>): Promise<SkillRequirements | null> {
  const reqPath = join(dir, "requirements.json");
  if (!existsSync(reqPath)) return null;

  try {
    const raw = JSON.parse(await readFile(reqPath, "utf-8"));

    const platform = process.platform === "darwin" ? "macos" : process.platform === "win32" ? "windows" : "linux";
    const bins: SkillBin[] = [];
    for (const b of raw.bins ?? []) {
      const install = typeof b.install === "object" ? (b.install[platform] ?? b.install.macos ?? "") : (b.install ?? "");
      bins.push({
        name: b.name,
        install,
        required: b.required !== false,
        installed: await isBinInstalled(b.name),
      });
    }

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
      bins,
      env,
      groups,
      safe: raw.safe === true,
      notes: raw.notes ?? "",
    };
  } catch {
    return null;
  }
}

async function loadSkill(slug: string, envVars: Record<string, string>): Promise<SkillInfo | null> {
  const dir = join(SKILLS_DIR, slug);
  const skillFile = join(dir, "SKILL.md");
  const agentFile = join(dir, "AGENT.md");

  let mdPath: string | null = null;
  if (existsSync(skillFile)) mdPath = skillFile;
  else if (existsSync(agentFile)) mdPath = agentFile;
  else return null;

  const content = await readFile(mdPath, "utf-8");
  const fm = parseSkillFrontmatter(content);
  const files = await readTree(dir);

  const metaPath = join(dir, "_meta.json");
  let source = "created";
  if (existsSync(metaPath)) {
    try {
      const meta = JSON.parse(await readFile(metaPath, "utf-8"));
      if (meta.slug) source = "clawhub";
    } catch (err) { console.debug("skill load error", err); }
  }

  const requirements = await loadRequirements(dir, envVars);

  let state = "pending";
  if (requirements) {
    state = requirements.safe ? "verified" : "rejected";
  }

  const binsMissing = requirements ? requirements.bins.some((b) => b.required && !b.installed) : false;
  const secretsMissing = requirements ? (
    requirements.env.some((e) => e.required && !e.group && !e.present) ||
    Object.values(requirements.groups).some((g) => !g.satisfied)
  ) : false;

  const statePath = join(dir, "_state.json");
  if (existsSync(statePath)) {
    try {
      const saved = JSON.parse(await readFile(statePath, "utf-8"));
      if (saved.state === "active" && state !== "rejected" && !binsMissing && !secretsMissing) state = "active";
    } catch (err) { console.debug("skill load error", err); }
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

async function listSkills(getEnvVars: (skillId?: string) => Record<string, string>): Promise<SkillInfo[]> {
  if (!existsSync(SKILLS_DIR)) return [];
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const skills: SkillInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
    const skill = await loadSkill(entry.name, getEnvVars(entry.name));
    if (skill) skills.push(skill);
  }
  return skills;
}

export function registerSkillsBus(bus: EventBus, log: Logger, getEnvVars: (skillId?: string) => Record<string, string>, broadcast: (route: string, data: unknown) => void): void {
  bus.on("skills.list", async () => {
    const skills = await listSkills(getEnvVars);
    return { skills };
  });

  bus.on("skills.get", async (data: { id: string }) => {
    const skill = await loadSkill(data.id, getEnvVars(data.id));
    if (!skill) throw new Error(`Skill not found: ${data.id}`);
    const dir = join(SKILLS_DIR, data.id);
    const files: { name: string; content: string }[] = [];
    await collectFiles(dir, "", files);
    const skillIdx = files.findIndex((f) => f.name === "SKILL.md" || f.name === "AGENT.md");
    if (skillIdx > 0) {
      const [skillFile] = files.splice(skillIdx, 1);
      files.unshift(skillFile);
    }
    return { skill, files };
  });

  bus.on("skills.activate", async (data: { id: string }) => {
    const dir = join(SKILLS_DIR, data.id);
    if (!existsSync(dir)) throw new Error(`Skill not found: ${data.id}`);
    await writeFile(join(dir, "_state.json"), JSON.stringify({ state: "active" }), "utf-8");
    const skill = await loadSkill(data.id, getEnvVars(data.id));
    log.info("Skill activated", { id: data.id });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  bus.on("skills.deactivate", async (data: { id: string }) => {
    const dir = join(SKILLS_DIR, data.id);
    if (!existsSync(dir)) throw new Error(`Skill not found: ${data.id}`);
    const statePath = join(dir, "_state.json");
    if (existsSync(statePath)) await rm(statePath);
    const skill = await loadSkill(data.id, getEnvVars(data.id));
    log.info("Skill deactivated", { id: data.id });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  bus.on("skills.state.set", async (data: { id: string; state: string }) => {
    const dir = join(SKILLS_DIR, data.id);
    if (!existsSync(dir)) throw new Error(`Skill not found: ${data.id}`);
    if (data.state === "active") {
      await writeFile(join(dir, "_state.json"), JSON.stringify({ state: "active" }), "utf-8");
    } else {
      const statePath = join(dir, "_state.json");
      if (existsSync(statePath)) await rm(statePath);
    }
    const skill = await loadSkill(data.id, getEnvVars(data.id));
    log.info("Skill state set", { id: data.id, state: data.state });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  bus.on("skills.delete", async (data: { id: string }) => {
    const dir = join(SKILLS_DIR, data.id);
    if (!existsSync(dir)) throw new Error(`Skill not found: ${data.id}`);
    await rm(dir, { recursive: true });
    log.info("Skill deleted", { id: data.id });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { ok: true };
  });

  bus.on("skills.create", async (data: { id: string; name: string }) => {
    const dir = join(SKILLS_DIR, data.id);
    await mkdir(dir, { recursive: true });
    const content = `---\nname: ${data.name}\ndescription: \nversion: 1.0.0\nlicense: MIT\nallowed-tools: app_read app_glob app_grep\nmetadata:\n  knowledge: false\n  formats: false\n---\n\nYou are a helpful assistant.\n`;
    await writeFile(join(dir, "SKILL.md"), content, "utf-8");
    const skill = await loadSkill(data.id, getEnvVars(data.id));
    log.info("Skill created", { id: data.id });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  log.info("Skills bus registered");
}
