import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCredStore, type Credentials } from "../cred";
import type { KeychainProvider } from "../secrets";
import type { Logger } from "../../logger.types";

class MemoryKeychain implements KeychainProvider {
  private data = new Map<string, string>();

  async resolve(account: string): Promise<string> {
    const v = this.data.get(account);
    if (!v) throw new Error(`Not found: ${account}`);
    return v;
  }

  async store(account: string, value: string): Promise<void> {
    this.data.set(account, value);
  }

  async remove(account: string): Promise<void> {
    this.data.delete(account);
  }
}

const noop = () => {};
const log: Logger = {
  info: noop, warn: noop, error: noop, debug: noop,
  createLogger: () => log,
} as any;

describe("CredStore", () => {
  let dir: string;
  let keychain: MemoryKeychain;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cred-test-"));
    keychain = new MemoryKeychain();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("given no cred.enc, when init, then starts empty", async () => {
    const cred = createCredStore(log, dir, keychain);
    await cred.init();
    expect(cred.keys()).toEqual([]);
  });

  it("given set called, when get, then returns value", async () => {
    const cred = createCredStore(log, dir, keychain);
    await cred.init();
    await cred.set("provider.oauth.anthropic.token", "sk-ant-123");
    expect(await cred.get("provider.oauth.anthropic.token")).toBe("sk-ant-123");
  });

  it("given set called, when new instance loads, then persists", async () => {
    const cred1 = createCredStore(log, dir, keychain);
    await cred1.init();
    await cred1.set("env.GITHUB_TOKEN", "ghp_abc");

    const cred2 = createCredStore(log, dir, keychain);
    await cred2.init();
    expect(await cred2.get("env.GITHUB_TOKEN")).toBe("ghp_abc");
  });

  it("given key exists, when delete, then removes it", async () => {
    const cred = createCredStore(log, dir, keychain);
    await cred.init();
    await cred.set("svc.pat.github.token", "ghp_xyz");
    await cred.delete("svc.pat.github.token");
    expect(await cred.get("svc.pat.github.token")).toBeNull();
  });

  it("given multiple keys, when clear with prefix, then removes matching", async () => {
    const cred = createCredStore(log, dir, keychain);
    await cred.init();
    await cred.set("svc.pat.github.token", "ghp_1");
    await cred.set("svc.pat.todoist.token", "td_1");
    await cred.set("provider.oauth.anthropic.token", "sk_1");

    await cred.deletePrefix("svc.pat.");
    expect(cred.keys()).toEqual(["provider.oauth.anthropic.token"]);
  });

  it("given keys set, when list, then returns all key names", async () => {
    const cred = createCredStore(log, dir, keychain);
    await cred.init();
    await cred.set("a", "1");
    await cred.set("b", "2");
    expect(cred.keys().sort()).toEqual(["a", "b"]);
  });

  it("given cred.enc exists, when master key changes, then starts fresh", async () => {
    const cred1 = createCredStore(log, dir, keychain);
    await cred1.init();
    await cred1.set("x", "y");

    const keychain2 = new MemoryKeychain();
    const cred2 = createCredStore(log, dir, keychain2);
    await cred2.init();
    expect(cred2.keys()).toEqual([]);
  });

  it("given cred.enc written, then file exists on disk", async () => {
    const cred = createCredStore(log, dir, keychain);
    await cred.init();
    await cred.set("test", "value");
    expect(existsSync(join(dir, "cred.enc"))).toBe(true);
  });
});
