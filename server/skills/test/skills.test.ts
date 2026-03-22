import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getSkillFrontmatter, getAllSkillFrontmatter, invalidateSkillCache, SKILLS_DIR } from "../skills";

/** Override SKILLS_DIR for tests by writing to a temp dir and symlinking */
let testDir: string;
let origDir: string;

function writeSkill(slug: string, frontmatter: string) {
  const dir = join(testDir, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), frontmatter, "utf-8");
}

describe("skill frontmatter cache", () => {
  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "skills-test-"));
    origDir = (globalThis as any).__SKILLS_DIR_OVERRIDE;
    (globalThis as any).__SKILLS_DIR_OVERRIDE = testDir;
    invalidateSkillCache();
  });

  afterEach(() => {
    (globalThis as any).__SKILLS_DIR_OVERRIDE = origDir;
    invalidateSkillCache();
    rmSync(testDir, { recursive: true, force: true });
  });

  test("given skill with frontmatter, when getSkillFrontmatter, then returns parsed meta", () => {
    writeSkill("test-skill", `---
name: Test Skill
description: A test skill
allowed-tools: app_bash app_read
---

Prompt content here.
`);
    const meta = getSkillFrontmatter("test-skill");
    expect(meta).toBeDefined();
    expect(meta!.name).toBe("Test Skill");
    expect(meta!.description).toBe("A test skill");
    expect(meta!.allowedTools).toEqual(["app_bash", "app_read"]);
    expect(meta!.id).toBe("test-skill");
  });

  test("given no frontmatter, when getSkillFrontmatter, then returns undefined", () => {
    writeSkill("bad-skill", "No frontmatter here");
    expect(getSkillFrontmatter("bad-skill")).toBeUndefined();
  });

  test("given missing skill, when getSkillFrontmatter, then returns undefined", () => {
    expect(getSkillFrontmatter("nonexistent")).toBeUndefined();
  });

  test("given multiple skills, when getAllSkillFrontmatter, then returns all", () => {
    writeSkill("skill-a", `---\nname: A\ndescription: desc a\nallowed-tools: app_read\n---\n`);
    writeSkill("skill-b", `---\nname: B\ndescription: desc b\nallowed-tools: app_bash\n---\n`);
    const all = getAllSkillFrontmatter();
    expect(all).toHaveLength(2);
    const names = all.map((s) => s.name).sort();
    expect(names).toEqual(["A", "B"]);
  });

  test("given cache populated, when invalidateSkillCache and skill added, then picks up new skill", () => {
    writeSkill("first", `---\nname: First\ndescription: first\nallowed-tools: app_read\n---\n`);
    expect(getAllSkillFrontmatter()).toHaveLength(1);

    writeSkill("second", `---\nname: Second\ndescription: second\nallowed-tools: app_bash\n---\n`);
    expect(getAllSkillFrontmatter()).toHaveLength(1);

    invalidateSkillCache();
    expect(getAllSkillFrontmatter()).toHaveLength(2);
  });

  test("given skill without allowed-tools, when getSkillFrontmatter, then allowedTools is empty", () => {
    writeSkill("no-tools", `---\nname: NoTools\ndescription: none\n---\n`);
    const meta = getSkillFrontmatter("no-tools");
    expect(meta).toBeDefined();
    expect(meta!.allowedTools).toEqual([]);
  });

  test("given AGENT.md instead of SKILL.md, when getSkillFrontmatter, then still loads", () => {
    const dir = join(testDir, "agent-style");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "AGENT.md"), `---\nname: Agent Style\ndescription: uses agent.md\nallowed-tools: app_read\n---\n`, "utf-8");
    const meta = getSkillFrontmatter("agent-style");
    expect(meta).toBeDefined();
    expect(meta!.name).toBe("Agent Style");
  });
});
