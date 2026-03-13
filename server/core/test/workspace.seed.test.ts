import { describe, test, expect, afterAll } from "vitest";
import { rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createStorage } from "../storage";
import { createConfiguration } from "../config";
import { ensureWorkspace } from "../workspace.seed";
import { noopLogger } from "../../logger";

const TEST_ROOT = join(tmpdir(), `sparky-workspace-test-${Date.now()}`);
let runId = 0;

function setup() {
  const root = join(TEST_ROOT, `run-${++runId}`);
  const storage = createStorage(noopLogger, root).seed();
  const config = createConfiguration(storage);
  return { storage, config, root };
}

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe("ensureWorkspace", () => {
  test("given fresh config (first run), then seeds default workspace and creates directory", () => {
    const { storage, config, root } = setup();

    const { wsDir, dbPath } = ensureWorkspace(config, storage);

    expect(wsDir).toBe("workspaces/my-workspace");
    expect(dbPath).toBe(join(root, "workspaces/my-workspace/workspace.db"));
    expect(existsSync(join(root, "workspaces/my-workspace"))).toBe(true);

    const workspaces = config.get("workspaces");
    expect(workspaces).toHaveLength(1);
    expect(workspaces![0].name).toBe("My Workspace");
    expect(workspaces![0].path).toBe("workspaces/my-workspace");

    const activeWs = config.get("activeWorkspace");
    expect(activeWs).toBe(workspaces![0].id);
  });

  test("given existing workspace, then does not create a new one", () => {
    const { storage, config } = setup();

    // Seed first
    ensureWorkspace(config, storage);
    const workspacesAfterFirst = config.get("workspaces")!;

    // Run again
    const second = ensureWorkspace(config, storage);

    const workspacesAfterSecond = config.get("workspaces")!;
    expect(workspacesAfterSecond).toHaveLength(1);
    expect(workspacesAfterSecond[0].id).toBe(workspacesAfterFirst[0].id);
    expect(second.wsDir).toBe("workspaces/my-workspace");
  });

  test("given existing workspace with active set, then resolves to that workspace", () => {
    const { storage, config, root } = setup();

    // Write config synchronously (same as ensureWorkspace does)
    const ws = {
      id: "custom-id",
      name: "Custom",
      path: "workspaces/custom",
      createdAt: new Date().toISOString(),
    };
    storage.write("config.json", { workspaces: [ws], activeWorkspace: "custom-id" });

    const { wsDir, dbPath } = ensureWorkspace(config, storage);

    expect(wsDir).toBe("workspaces/custom");
    expect(dbPath).toBe(join(root, "workspaces/custom/workspace.db"));
    expect(existsSync(join(root, "workspaces/custom"))).toBe(true);
    expect(config.get("workspaces")).toHaveLength(1);
  });

  test("given workspaces exist but no active set, then falls back to root db", () => {
    const { storage, config, root } = setup();

    const ws = {
      id: "some-id",
      name: "Some",
      path: "workspaces/some",
      createdAt: new Date().toISOString(),
    };
    storage.write("config.json", { workspaces: [ws] });

    const { wsDir, dbPath } = ensureWorkspace(config, storage);

    expect(wsDir).toBe("");
    expect(dbPath).toBe(join(root, "workspace.db"));
  });
});
