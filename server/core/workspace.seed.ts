import { v7 as randomUUIDv7 } from "uuid";
import type { StorageProvider } from "./storage";
import type { Configuration } from "./config";

const CONFIG_PATH = "config.json";

export interface Workspace {
  readonly dir: string;
  readonly dbPath: string;
}

export function createWorkspace(config: Configuration, storage: StorageProvider): Workspace {
  let activeWs = config.get("activeWorkspace");
  let workspaces = config.get("workspaces") ?? [];

  if (workspaces.length === 0) {
    const defaultWs = {
      id: randomUUIDv7(),
      name: "My Workspace",
      path: "workspaces/my-workspace",
      createdAt: new Date().toISOString(),
    };
    workspaces = [defaultWs];
    activeWs = defaultWs.id;

    const current = config.read();
    current.workspaces = workspaces;
    current.activeWorkspace = activeWs;
    storage.write(CONFIG_PATH, current);
  }

  const ws = workspaces.find((w: any) => w.id === activeWs);
  const dir = ws ? ws.path : "";
  if (dir) storage.mkdir(dir);
  const dbPath = dir ? storage.root(`${dir}/workspace.db`) : storage.root("workspace.db");
  return { dir, dbPath };
}

/** @deprecated Use createWorkspace instead */
export const ensureWorkspace = (config: Configuration, storage: StorageProvider) => {
  const ws = createWorkspace(config, storage);
  return { wsDir: ws.dir, dbPath: ws.dbPath };
};
