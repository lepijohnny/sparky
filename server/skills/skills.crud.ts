import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { mkdtempSync, readdirSync, existsSync, readFileSync, cpSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
  let displayName: string | undefined;
  let savedState: string | undefined;
  const metaPath = skillPath(slug, "_meta.json");
  if (storage.exists(metaPath)) {
    try {
      const meta = storage.read<any>(metaPath);
      if (meta.slug) source = "clawhub";
      if (meta.displayName) displayName = meta.displayName;
      if (meta.state) savedState = meta.state;
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

  if (savedState === "active" && state !== "rejected" && !binsMissing && !secretsMissing) {
    state = "active";
  }

  return {
    id: slug,
    name: displayName ?? fm.name ?? slug,
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

const SkillImport = z.object({
  path: z.string().min(1).describe("Absolute path to a .zip file"),
});

function extractAndValidateSkillZip(zipPath: string): { tmpDir: string; skillDir: string; slug: string } {
  const tmpDir = mkdtempSync(join(tmpdir(), "sparky-skill-import-"));

  try {
    try {
      execFileSync("unzip", ["-o", zipPath, "-d", tmpDir]);
    } catch (err: any) {
      throw new Error(`Failed to extract zip: ${err.stderr?.toString() ?? String(err)}`);
    }

    const topEntries = readdirSync(tmpDir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith(".") && !e.name.startsWith("__"));

    let skillDir: string;
    if (topEntries.length === 1 && topEntries[0].isDirectory()) {
      skillDir = join(tmpDir, topEntries[0].name);
    } else {
      skillDir = tmpDir;
    }

    const hasSkillMd = existsSync(join(skillDir, "SKILL.md"));
    if (!hasSkillMd) {
      throw new Error("Invalid skill package: missing SKILL.md in the root of the archive");
    }

    const mdPath = join(skillDir, "SKILL.md");
    const content = readFileSync(mdPath, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
      throw new Error("Invalid skill: SKILL.md must start with YAML frontmatter (---\\n...\\n---)");
    }

    const nameLine = fmMatch[1].match(/^name:\s*(.+)$/m);
    if (!nameLine) {
      throw new Error("Invalid skill: frontmatter must include a 'name' field");
    }

    const dirName = topEntries.length === 1 && topEntries[0].isDirectory()
      ? topEntries[0].name
      : null;

    const slug = dirName?.match(/^[a-z0-9][a-z0-9-]*$/)
      ? dirName
      : nameLine[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    if (!slug || !slug.match(/^[a-z0-9][a-z0-9-]*$/)) {
      throw new Error("Could not derive a valid skill slug from the package");
    }

    return { tmpDir, skillDir, slug };
  } catch (err) {
    rmSync(tmpDir, { recursive: true, force: true });
    throw err;
  }
}

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

  function updateMeta(id: string, patch: Record<string, unknown>): void {
    const metaPath = skillPath(id, "_meta.json");
    const existing = storage.exists(metaPath) ? storage.read<Record<string, unknown>>(metaPath) : {};
    storage.write(metaPath, { ...existing, ...patch });
  }

  bus.on("skills.activate", async (data) => {
    const { id } = SkillId.parse(data);
    const dir = skillPath(id);
    if (!storage.exists(dir)) throw new Error(`Skill not found: ${id}`);
    updateMeta(id, { state: "active" });
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
    updateMeta(id, { state: undefined });
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
    updateMeta(id, { state: state === "active" ? "active" : undefined });
    const skill = await loadSkill(storage, id, getEnvVars(id));
    log.info("Skill state set", { id, state });
    invalidateSkillCache();
    broadcast("skills.changed", {});
    return { skill };
  });

  bus.on("skills.rename", async (data) => {
    const { id, name } = z.object({
      id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
      name: z.string().min(1).describe("New display name"),
    }).parse(data);

    const dir = skillPath(id);
    if (!storage.exists(dir)) throw new Error(`Skill not found: ${id}`);
    updateMeta(id, { displayName: name.trim() });
    const skill = await loadSkill(storage, id, getEnvVars(id));
    log.info("Skill renamed", { id, name: name.trim() });
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

  bus.on("skills.export", async (data) => {
    const { id, dest } = z.object({
      id: z.string().min(1),
      dest: z.string().min(1).describe("Absolute path for the output .zip file"),
    }).parse(data);

    const dir = skillPath(id);
    if (!storage.exists(dir)) throw new Error(`Skill not found: ${id}`);

    const rootDir = storage.root(dir);
    const excludes = ["_meta.json", "requirements.json"];
    const args = ["-r", dest, ".", ...excludes.flatMap((f) => ["-x", f])];

    try {
      execFileSync("zip", args, { cwd: rootDir });
    } catch (err: any) {
      throw new Error(`Failed to create zip: ${err.stderr?.toString() ?? String(err)}`);
    }

    log.info("Skill exported", { id, dest });
    return { ok: true, path: dest };
  });

  bus.on("skills.import", async (data) => {
    const { path } = SkillImport.parse(data);
    const { tmpDir, skillDir, slug } = extractAndValidateSkillZip(path);

    try {
      if (storage.exists(skillPath(slug))) {
        throw new Error(`Skill "${slug}" already exists. Delete it first or rename the import.`);
      }

      storage.mkdir(skillPath(slug));
      cpSync(skillDir, storage.root(skillPath(slug)), { recursive: true });

      storage.write(skillPath(slug, "_meta.json"), {
        slug,
        source: "imported",
        importedAt: new Date().toISOString(),
        originalFile: path,
      });

      const skill = await loadSkill(storage, slug, getEnvVars(slug));
      log.info("Skill imported", { id: slug, path });
      invalidateSkillCache();
      broadcast("skills.changed", {});

      let chatId: string | undefined;
      try {
        const res = await bus.emit("chat.system.ask", {
          content: `Review and verify the imported skill "${slug}". Check its SKILL.md, scripts, and any referenced files for safety and correctness.`,
          kind: "skills",
        });
        chatId = res.chatId;
      } catch (err) {
        log.warn("Auto-review failed", { id: slug, error: String(err) });
      }

      return { skill, chatId };
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  log.info("Skills bus registered");
}
