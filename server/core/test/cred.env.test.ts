import { describe, it, expect, beforeEach } from "vitest";
import { createCredStore, type Credentials } from "../cred";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function createTestCred(): { cred: Credentials; setMap: (entries: [string, string][]) => void } {
  const log = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as any;
  const basePath = mkdtempSync(join(tmpdir(), "cred-test-"));
  const keychain = {
    resolve: async () => { throw new Error("not found"); },
    store: async () => {},
    remove: async () => {},
  };
  const cred = createCredStore(log, basePath, keychain);

  const setMap = (entries: [string, string][]) => {
    for (const [k, v] of entries) {
      (cred as any).set?.(k, v);
    }
  };

  return { cred, setMap };
}

describe("getEnvVars", () => {
  let cred: Credentials;

  beforeEach(async () => {
    const t = createTestCred();
    cred = t.cred;
    await cred.init();
  });

  it("given env vars set, when getEnvVars called, then returns all non-meta vars", async () => {
    await cred.set("env.OPENAI_API_KEY", "sk-123");
    await cred.set("env.GEMINI_API_KEY", "gem-456");
    await cred.set("env.meta.OPENAI_API_KEY", "my-skill");

    const vars = cred.getEnvVars();
    expect(vars).toEqual({
      OPENAI_API_KEY: "sk-123",
      GEMINI_API_KEY: "gem-456",
    });
    expect(vars).not.toHaveProperty("meta.OPENAI_API_KEY");
  });

  it("given no env vars, when getEnvVars called, then returns empty", async () => {
    await cred.set("svc.github.token", "tok");
    expect(cred.getEnvVars()).toEqual({});
  });
});

describe("getEnvVarsForSkill", () => {
  let cred: Credentials;

  beforeEach(async () => {
    const t = createTestCred();
    cred = t.cred;
    await cred.init();
  });

  it("given untagged vars only, when queried for any skill, then returns all", async () => {
    await cred.set("env.KEY_A", "a");
    await cred.set("env.KEY_B", "b");

    const result = cred.getEnvVarsForSkill("any-skill");
    expect(result).toEqual({ KEY_A: "a", KEY_B: "b" });
  });

  it("given var tagged to skill, when queried for that skill, then includes it", async () => {
    await cred.set("env.OPENAI_API_KEY", "sk-123");
    await cred.set("env.meta.OPENAI_API_KEY", "video-transcriber");

    const result = cred.getEnvVarsForSkill("video-transcriber");
    expect(result).toHaveProperty("OPENAI_API_KEY", "sk-123");
  });

  it("given var tagged to other skill, when queried for different skill, then excludes it", async () => {
    await cred.set("env.OPENAI_API_KEY", "sk-123");
    await cred.set("env.meta.OPENAI_API_KEY", "video-transcriber");

    const result = cred.getEnvVarsForSkill("code-reviewer");
    expect(result).not.toHaveProperty("OPENAI_API_KEY");
  });

  it("given tagged and untagged vars, when queried, then only tagged returned", async () => {
    await cred.set("env.OPENAI_API_KEY", "sk-tagged");
    await cred.set("env.meta.OPENAI_API_KEY", "my-skill");
    await cred.set("env.GEMINI_API_KEY", "gem-global");

    const result = cred.getEnvVarsForSkill("my-skill");
    expect(result).toEqual({ OPENAI_API_KEY: "sk-tagged" });
  });

  it("given mixed tags, when queried, then only matching tagged returned", async () => {
    await cred.set("env.KEY_A", "a-val");
    await cred.set("env.meta.KEY_A", "skill-1");
    await cred.set("env.KEY_B", "b-val");
    await cred.set("env.meta.KEY_B", "skill-2");
    await cred.set("env.KEY_C", "c-val");

    const forSkill1 = cred.getEnvVarsForSkill("skill-1");
    expect(forSkill1).toEqual({ KEY_A: "a-val" });

    const forSkill2 = cred.getEnvVarsForSkill("skill-2");
    expect(forSkill2).toEqual({ KEY_B: "b-val" });
  });

  it("given no tagged vars for skill, when queried, then returns all globals", async () => {
    await cred.set("env.KEY_A", "a-val");
    await cred.set("env.meta.KEY_A", "other-skill");
    await cred.set("env.KEY_B", "b-val");
    await cred.set("env.KEY_C", "c-val");

    const result = cred.getEnvVarsForSkill("my-skill");
    expect(result).toEqual({ KEY_B: "b-val", KEY_C: "c-val" });
  });

  it("given no vars, when queried, then returns empty", async () => {
    expect(cred.getEnvVarsForSkill("any")).toEqual({});
  });

  it("given non-env keys, when queried, then ignores them", async () => {
    await cred.set("svc.github.token", "tok");
    await cred.set("env.MY_KEY", "val");

    const result = cred.getEnvVarsForSkill("any");
    expect(result).toEqual({ MY_KEY: "val" });
  });
});
