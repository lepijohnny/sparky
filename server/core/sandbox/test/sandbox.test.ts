import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkQemu } from "../sandbox.check";
import { listSandboxImages } from "../sandbox.images";
import { SandboxAllowlist } from "../sandbox.env";
import { createStorage, type StorageProvider } from "../../storage";
import { createConfiguration, type Configuration } from "../../config";
import { noopLogger } from "../../../logger";

describe("sandbox.check", () => {
  test("returns platform and install command", () => {
    const status = checkQemu();
    expect(status.platform).toBeOneOf(["macos", "linux", "unsupported"]);
    expect(typeof status.installCommand).toBe("string");
    expect(typeof status.installed).toBe("boolean");
    if (status.installed) {
      expect(status.path).toBeDefined();
      expect(status.version).toBeDefined();
    }
  });
});

describe("sandbox.images", () => {
  let tmpDir: string;
  let storage: StorageProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sparky-test-"));
    storage = createStorage(noopLogger, tmpDir).seed();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns empty when no images directory exists", () => {
    const images = listSandboxImages(storage);
    expect(images).toEqual([]);
  });

  test("returns empty when images directory is empty", () => {
    mkdirSync(join(tmpDir, "sandbox", "images"), { recursive: true });
    const images = listSandboxImages(storage);
    expect(images).toEqual([]);
  });

  test("lists images with valid manifest.json", () => {
    const imgDir = join(tmpDir, "sandbox", "images", "minimal");
    mkdirSync(imgDir, { recursive: true });
    writeFileSync(join(imgDir, "manifest.json"), JSON.stringify({
      name: "Minimal",
      description: "Test image",
      tools: ["bash", "curl"],
    }));

    const images = listSandboxImages(storage);
    expect(images).toHaveLength(1);
    expect(images[0].id).toBe("minimal");
    expect(images[0].name).toBe("Minimal");
    expect(images[0].description).toBe("Test image");
    expect(images[0].tools).toEqual(["bash", "curl"]);
    expect(images[0].size).toBeGreaterThan(0);
  });

  test("skips directories without manifest.json", () => {
    const imgDir = join(tmpDir, "sandbox", "images", "broken");
    mkdirSync(imgDir, { recursive: true });
    writeFileSync(join(imgDir, "some-file.txt"), "hello");

    const images = listSandboxImages(storage);
    expect(images).toEqual([]);
  });

  test("lists multiple images", () => {
    const base = join(tmpDir, "sandbox", "images");
    for (const name of ["alpha", "beta"]) {
      const dir = join(base, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "manifest.json"), JSON.stringify({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        tools: [name],
      }));
    }

    const images = listSandboxImages(storage);
    expect(images).toHaveLength(2);
    expect(images.map((i) => i.id).sort()).toEqual(["alpha", "beta"]);
  });
});

describe("sandbox.allowlist", () => {
  let tmpDir: string;
  let config: Configuration;
  let allowlist: SandboxAllowlist;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sparky-test-"));
    const storage = createStorage(noopLogger, tmpDir).seed();
    config = createConfiguration(storage);
    allowlist = new SandboxAllowlist(config);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns empty list when no config exists", () => {
    expect(allowlist.list()).toEqual([]);
  });

  test("adds host", async () => {
    const entry = await allowlist.add("api.github.com");
    expect(entry).toBe("api.github.com");

    const list = allowlist.list();
    expect(list).toEqual(["api.github.com"]);
  });

  test("deduplicates entries", async () => {
    await allowlist.add("api.github.com");
    await allowlist.add("api.github.com");

    expect(allowlist.list()).toEqual(["api.github.com"]);
  });

  test("removes host", async () => {
    await allowlist.add("api.github.com");
    await allowlist.add("api.openai.com");

    const removed = await allowlist.remove("api.github.com");
    expect(removed).toBe(true);

    expect(allowlist.list()).toEqual(["api.openai.com"]);
  });

  test("remove returns false for missing entry", async () => {
    expect(await allowlist.remove("nope.com")).toBe(false);
  });

  test("isHostAllowed checks exact match", async () => {
    await allowlist.add("api.github.com");

    expect(allowlist.isHostAllowed("api.github.com")).toBe(true);
    expect(allowlist.isHostAllowed("github.com")).toBe(false);
    expect(allowlist.isHostAllowed("evil.com")).toBe(false);
  });

  test("isHostAllowed supports wildcard patterns", async () => {
    await allowlist.add("*.openai.com");

    expect(allowlist.isHostAllowed("api.openai.com")).toBe(true);
    expect(allowlist.isHostAllowed("chat.openai.com")).toBe(true);
    expect(allowlist.isHostAllowed("openai.com")).toBe(true);
    expect(allowlist.isHostAllowed("evil.com")).toBe(false);
  });

  test("persists to config.json", async () => {
    await allowlist.add("test.com");

    // New instance reads from same config
    const allowlist2 = new SandboxAllowlist(config);
    expect(allowlist2.list()).toEqual(["test.com"]);
  });
});
