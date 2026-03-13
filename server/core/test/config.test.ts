import { describe, test, expect, beforeEach, afterAll } from "vitest";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createStorage } from "../storage";
import { createConfiguration } from "../config";
import { noopLogger } from "../../logger";

const TEST_ROOT = join(tmpdir(), `sparky-config-test-${Date.now()}`);

function setup() {
  const storage = createStorage(noopLogger, TEST_ROOT).seed();
  const config = createConfiguration(storage);
  return { storage, config };
}

beforeEach(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("ConfigManager.get", () => {
  test("given no config file, when getting a key, then returns undefined", () => {
    const { config } = setup();
    expect(config.get("activeTheme")).toBeUndefined();
  });

  test("given existing config, when getting a key, then returns value", () => {
    const { storage, config } = setup();
    storage.write("config.json", { activeTheme: "dark" });
    expect(config.get("activeTheme")).toBe("dark");
  });
});

describe("ConfigManager.read", () => {
  test("given no config file, when reading, then returns empty object", () => {
    const { config } = setup();
    expect(config.read()).toEqual({});
  });

  test("given existing config, when reading, then returns full config", () => {
    const { storage, config } = setup();
    storage.write("config.json", { activeTheme: "dark", activeWorkspace: "ws-1" });
    const result = config.read();
    expect(result.activeTheme).toBe("dark");
    expect(result.activeWorkspace).toBe("ws-1");
  });
});

describe("ConfigManager.set", () => {
  test("given no config file, when setting a key, then creates file with value", async () => {
    const { config } = setup();
    await config.set("activeTheme", "dark");
    expect(config.get("activeTheme")).toBe("dark");
  });

  test("given existing config, when setting a key, then preserves other keys", async () => {
    const { storage, config } = setup();
    storage.write("config.json", { activeTheme: "dark" });
    await config.set("activeWorkspace", "ws-1");
    expect(config.get("activeTheme")).toBe("dark");
    expect(config.get("activeWorkspace")).toBe("ws-1");
  });
});

describe("ConfigManager.update", () => {
  test("given existing array, when updating with append, then array grows", async () => {
    const { config } = setup();
    await config.set("workspaces", [{ id: "ws-1", name: "First", path: "/a", createdAt: "2026-01-01" }]);
    await config.update("workspaces", (ws) => [...(ws ?? []), { id: "ws-2", name: "Second", path: "/b", createdAt: "2026-01-02" }]);
    const workspaces = config.get("workspaces");
    expect(workspaces?.length).toBe(2);
    expect(workspaces?.[1].name).toBe("Second");
  });
});

describe("ConfigManager queue ordering", () => {
  test("given concurrent updates to different keys, then no data is lost", async () => {
    const { config } = setup();

    // Fire multiple updates concurrently — all should be serialized
    await Promise.all([
      config.set("activeTheme", "dracula"),
      config.set("activeWorkspace", "ws-1"),
      config.set("llmDefault", { id: "llm-1", name: "Claude" }),
    ]);

    expect(config.get("activeTheme")).toBe("dracula");
    expect(config.get("activeWorkspace")).toBe("ws-1");
    expect(config.get("llmDefault")).toEqual({ id: "llm-1", name: "Claude" });
  });

  test("given concurrent updates to same key, then last write wins in order", async () => {
    const { config } = setup();

    // These should execute in order: first, second, third
    await Promise.all([
      config.set("activeTheme", "first"),
      config.set("activeTheme", "second"),
      config.set("activeTheme", "third"),
    ]);

    expect(config.get("activeTheme")).toBe("third");
  });

  test("given interleaved update and set on different keys, then both persist", async () => {
    const { config } = setup();
    await config.set("workspaces", [{ id: "ws-1", name: "A", path: "/a", createdAt: "2026-01-01" }]);

    await Promise.all([
      config.update("workspaces", (ws) => [...(ws ?? []), { id: "ws-2", name: "B", path: "/b", createdAt: "2026-01-02" }]),
      config.set("activeTheme", "nord"),
    ]);

    expect(config.get("workspaces")?.length).toBe(2);
    expect(config.get("activeTheme")).toBe("nord");
  });
});
