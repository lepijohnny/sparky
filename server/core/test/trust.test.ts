import { describe, test, expect, beforeEach } from "vitest";
import { createTrustStore, type TrustStore } from "../trust";
import { mkdtempSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const mockLog = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function mockKeychain() {
  const store = new Map<string, string>();
  return {
    resolve: async (account: string) => {
      const val = store.get(account);
      if (!val) throw new Error("not found");
      return val;
    },
    store: async (account: string, value: string) => { store.set(account, value); },
    remove: async (account: string) => { store.delete(account); },
  };
}

describe("TrustStore", () => {
  let basePath: string;
  let keychain: ReturnType<typeof mockKeychain>;
  let trust: TrustStore;

  beforeEach(async () => {
    basePath = mkdtempSync(join(tmpdir(), "trust-test-"));
    keychain = mockKeychain();
    trust = createTrustStore(mockLog as any, basePath, keychain);
    await trust.init();
  });

  test("given fresh init, then mode is read", () => {
    expect(trust.data().mode).toBe("read");
  });

  test("given fresh init, then all scopes have uniform shape", () => {
    for (const scope of ["read", "write", "bash"] as const) {
      expect(trust.data()[scope]).toHaveProperty("allow");
      expect(trust.data()[scope]).toHaveProperty("deny");
      expect(trust.data()[scope]).toHaveProperty("ask");
    }
  });

  test("given fresh init, then bash deny has defaults", () => {
    expect(trust.data().bash.deny.length).toBeGreaterThan(0);
    expect(trust.data().bash.deny.some((r) => r.label === "sudo")).toBe(true);
  });

  test("given fresh init, then write deny has defaults", () => {
    expect(trust.data().write.deny.some((r) => r.label === ".env")).toBe(true);
  });

  test("given fresh init, then read deny has defaults", () => {
    expect(trust.data().read.deny.some((r) => r.label === ".enc files")).toBe(true);
  });

  test("given setMode, then mode persists across reload", async () => {
    trust.setMode("execute");
    const trust2 = createTrustStore(mockLog as any, basePath, keychain);
    await trust2.init();
    expect(trust2.data().mode).toBe("execute");
  });

  test("given addRule, then rule is added and persisted", async () => {
    trust.addRule("bash", "allow", { label: "git status", pattern: "^git\\s+status" });
    expect(trust.data().bash.allow).toHaveLength(1);

    const trust2 = createTrustStore(mockLog as any, basePath, keychain);
    await trust2.init();
    expect(trust2.data().bash.allow).toHaveLength(1);
    expect(trust2.data().bash.allow[0].label).toBe("git status");
  });

  test("given addRule to ask list, then rule is added", () => {
    trust.addRule("write", "ask", { label: "config files", pattern: "\\.(json|yaml)$" });
    expect(trust.data().write.ask).toHaveLength(1);
  });

  test("given duplicate addRule, then not duplicated", () => {
    trust.addRule("bash", "deny", { label: "test", pattern: "^test" });
    trust.addRule("bash", "deny", { label: "test", pattern: "^test" });
    const count = trust.data().bash.deny.filter((r) => r.pattern === "^test").length;
    expect(count).toBe(1);
  });

  test("given addRule to different scopes, then independent", () => {
    trust.addRule("read", "deny", { label: "secrets", pattern: "secret" });
    trust.addRule("write", "deny", { label: "secrets", pattern: "secret" });
    expect(trust.data().read.deny.some((r) => r.pattern === "secret")).toBe(true);
    expect(trust.data().write.deny.some((r) => r.pattern === "secret")).toBe(true);
  });

  test("given removeRule, then rule is removed", () => {
    trust.addRule("bash", "allow", { label: "test", pattern: "^test" });
    trust.removeRule("bash", "allow", "^test");
    expect(trust.data().bash.allow).toHaveLength(0);
  });

  test("given removeRule on default, then removed", () => {
    const before = trust.data().bash.deny.length;
    trust.removeRule("bash", "deny", "^sudo\\b");
    expect(trust.data().bash.deny).toHaveLength(before - 1);
  });

  test("given clear, then everything is empty", () => {
    trust.clear();
    for (const scope of ["read", "write", "bash"] as const) {
      expect(trust.data()[scope].allow).toHaveLength(0);
      expect(trust.data()[scope].deny).toHaveLength(0);
      expect(trust.data()[scope].ask).toHaveLength(0);
    }
  });

  test("given reset, then returns to defaults", () => {
    trust.setMode("execute");
    trust.addRule("bash", "allow", { label: "test", pattern: "^test" });
    trust.addRule("write", "ask", { label: "cfg", pattern: "\\.cfg$" });
    trust.reset();
    expect(trust.data().mode).toBe("read");
    expect(trust.data().bash.allow).toHaveLength(0);
    expect(trust.data().bash.ask).toHaveLength(3);
    expect(trust.data().bash.deny.length).toBeGreaterThan(0);
    expect(trust.data().write.deny.length).toBeGreaterThan(0);
    expect(trust.data().read.deny.length).toBeGreaterThan(0);
  });

  test("given resolve read with denied path, then deny", () => {
    expect(trust.resolve("read", "/home/user/secrets.enc")).toMatchObject({ decision: "deny" });
  });

  test("given resolve read with normal path, then allow", () => {
    expect(trust.resolve("read", "/home/user/file.ts")).toMatchObject({ decision: "allow" });
  });

  test("given resolve read with ask rule, then prompt", () => {
    trust.addRule("read", "ask", { label: "logs", pattern: "\\.log$" });
    expect(trust.resolve("read", "/var/app.log")).toMatchObject({ decision: "prompt" });
  });

  test("given resolve write with denied path, then deny", () => {
    expect(trust.resolve("write", "/etc/passwd")).toMatchObject({ decision: "deny" });
  });

  test("given resolve write with normal path, then allow", () => {
    expect(trust.resolve("write", "/home/user/file.ts")).toMatchObject({ decision: "allow" });
  });

  test("given resolve write with ask rule, then prompt", () => {
    trust.addRule("write", "ask", { label: "config", pattern: "\\.json$" });
    expect(trust.resolve("write", "/project/tsconfig.json")).toMatchObject({ decision: "prompt" });
  });

  test("given resolve bash with denied command, then deny", () => {
    expect(trust.resolve("bash", "sudo rm -rf /")).toMatchObject({ decision: "deny" });
  });

  test("given resolve bash with allowed command, then allow", () => {
    trust.addRule("bash", "allow", { label: "git status", pattern: "^git\\s+status" });
    expect(trust.resolve("bash", "git status")).toMatchObject({ decision: "allow" });
  });

  test("given resolve bash with unknown command, then prompt", () => {
    expect(trust.resolve("bash", "npm install express")).toMatchObject({ decision: "prompt" });
  });

  test("given resolve bash with ask rule, then prompt", () => {
    trust.addRule("bash", "ask", { label: "install", pattern: "\\binstall\\b" });
    expect(trust.resolve("bash", "npm install express")).toMatchObject({ decision: "prompt" });
  });

  test("given resolve, when user adds ask rule after default deny, then deny still wins", () => {
    trust.addRule("bash", "ask", { label: "sudo", pattern: "^sudo" });
    expect(trust.resolve("bash", "sudo test")).toMatchObject({ decision: "deny" });
  });

  test("given resolve, when later rule conflicts with earlier rule, then later rule wins", () => {
    trust.addRule("bash", "allow", { label: "npm", pattern: "^npm", addedAt: 100 });
    trust.addRule("bash", "ask", { label: "npm install", pattern: "^npm\\s+install", addedAt: 200 });
    expect(trust.resolve("bash", "npm install foo")).toMatchObject({ decision: "prompt" });
  });

  test("given resolve, when allow is added after deny, then deny still wins", () => {
    trust.addRule("write", "deny", { label: "deny py", pattern: "\\.py$", addedAt: 100 });
    trust.addRule("write", "allow", { label: "allow workspace py", pattern: "workspaces.*\\.py$", addedAt: 200 });
    expect(trust.resolve("write", "/Users/me/.sparky/workspaces/test.py")).toMatchObject({ decision: "deny" });
    expect(trust.resolve("write", "/tmp/hack.py")).toMatchObject({ decision: "deny" });
  });

  test("given resolve bus with ask event, then prompt", () => {
    expect(trust.resolve("bus", "settings.labels.delete")).toMatchObject({ decision: "prompt" });
  });

  test("given resolve bus with deny event, then deny", () => {
    expect(trust.resolve("bus", "settings.workspace.remove")).toMatchObject({ decision: "deny" });
  });

  test("given resolve bus with normal event, then allow", () => {
    expect(trust.resolve("bus", "settings.labels.create")).toMatchObject({ decision: "allow" });
  });

  test("given trust.enc exists, then file is created on flush", () => {
    trust.setMode("write");
    expect(existsSync(join(basePath, "trust.enc"))).toBe(true);
  });

  test("given rm command, then default ask rule triggers prompt", () => {
    const res = trust.resolve("bash", "rm ~/.sparky/skills/test/FILE.md");
    expect(res).toMatchObject({ decision: "prompt" });
    expect(res.rule?.label).toBe("rm");
  });

  test("given rm -rf /, then deny rule wins over ask rule", () => {
    expect(trust.resolve("bash", "rm -rf /")).toMatchObject({ decision: "deny" });
  });

  test("given skillApproved with no matching rule, then prompt decision has no rule", () => {
    const res = trust.resolve("bash", "ls -la");
    expect(res.decision).toBe("prompt");
    expect(res.rule).toBeUndefined();
  });

  test("given skillApproved with rm command, then prompt decision has rule", () => {
    const res = trust.resolve("bash", "rm file.txt");
    expect(res.decision).toBe("prompt");
    expect(res.rule).toBeDefined();
  });

  test("given custom bash deny rules added, then default ask rules still present", () => {
    trust.addRule("bash", "deny", { label: "custom deny", pattern: "^dangerous" });
    const data = trust.data();
    const rmAsk = data.bash.ask.find((r) => r.label === "rm");
    expect(rmAsk).toBeDefined();
    expect(rmAsk?.pattern).toBe("\\brm\\b");
  });

  test("given defaults merged with saved rules, then no duplicate default rules", async () => {
    trust.addRule("bash", "ask", { label: "rm", pattern: "\\brm\\b" });
    const data = trust.data();
    const rmRules = data.bash.ask.filter((r) => r.label === "rm");
    expect(rmRules).toHaveLength(1);
  });
});
