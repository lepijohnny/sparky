import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readdirSync } from "node:fs";

const DEFAULT_SKILLS_DIR = join(homedir(), ".sparky", "skills");

export function getSkillsDir(): string {
  return (globalThis as any).__SKILLS_DIR_OVERRIDE ?? DEFAULT_SKILLS_DIR;
}

export const SKILLS_DIR = DEFAULT_SKILLS_DIR;

export interface SkillBin {
  name: string;
  install: string;
  required: boolean;
  installed: boolean;
}

export interface SkillEnvVar {
  name: string;
  required: boolean;
  group?: string;
  hint?: string;
  present: boolean;
}

export interface SkillEnvGroup {
  min: number;
  hint?: string;
  satisfied: boolean;
}

export interface SkillRequirements {
  bins: SkillBin[];
  env: SkillEnvVar[];
  groups: Record<string, SkillEnvGroup>;
  safe: boolean;
  notes: string;
}

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  license: string;
  author: string;
  icon: string;
  state: string;
  source: string;
  files: SkillFileEntry[];
  requirements: SkillRequirements | null;
  binsMissing: boolean;
  secretsMissing: boolean;
}

export interface SkillFileEntry {
  name: string;
  isDir: boolean;
  children?: SkillFileEntry[];
}

export interface SkillMeta {
  id: string;
  name: string;
  description: string;
  allowedTools: string[];
  mdPath: string;
}

const skillMetaCache = new Map<string, SkillMeta>();
let skillMetaCacheDirty = true;

export function invalidateSkillCache(): void {
  skillMetaCacheDirty = true;
}

function ensureSkillCache(): void {
  if (!skillMetaCacheDirty) return;
  skillMetaCache.clear();
  skillMetaCacheDirty = false;

  const dir = getSkillsDir();
  if (!existsSync(dir)) return;
  try {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      for (const mdName of ["SKILL.md", "AGENT.md"]) {
        const mdPath = join(dir, d.name, mdName);
        if (!existsSync(mdPath)) continue;
        const raw = readFileSync(mdPath, "utf-8");
        const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
        if (!fmMatch) break;

        const nameLine = fmMatch[1].match(/^name:\s*(.+)$/m);
        const descLine = fmMatch[1].match(/^description:\s*(.+)$/m);
        const toolsLine = fmMatch[1].match(/^allowed-tools:\s*(.+)$/m);

        skillMetaCache.set(d.name, {
          id: d.name,
          name: nameLine?.[1]?.trim() ?? d.name,
          description: descLine?.[1]?.trim() ?? "",
          allowedTools: toolsLine ? toolsLine[1].split(/\s+/).filter(Boolean) : [],
          mdPath,
        });
        break;
      }
    }
  } catch (err) {
    console.debug("Failed to load skill cache", err);
  }
}

export function getSkillFrontmatter(skillId: string): SkillMeta | undefined {
  ensureSkillCache();
  return skillMetaCache.get(skillId);
}

export function getAllSkillFrontmatter(): SkillMeta[] {
  ensureSkillCache();
  return [...skillMetaCache.values()];
}
