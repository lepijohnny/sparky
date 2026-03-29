import type { EventBus } from "../core/bus";
import type { StorageProvider } from "../core/storage";
import type { ConfigManager } from "../core/config";
import type { Logger } from "../logger.types";
import type { Workspace, WorkspaceSpace } from "./workspace.types";
import { statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const WORKSPACES_REL = "workspaces";

export class WorkspaceSettings {
  private log;

  constructor(
    private bus: EventBus,
    private storage: StorageProvider,
    private config: ConfigManager,
    logger: Logger,
  ) {
    this.log = logger;

    bus.on("settings.workspace.list", () => this.list());
    bus.on("settings.workspace.add", (data) => this.add(data));
    bus.on("settings.workspace.remove", (data) => this.remove(data));
    bus.on("settings.workspace.active.get", () => this.getActive());
    bus.on("settings.workspace.active.set", (data) => this.setActive(data));
    bus.on("settings.workspace.update", (data) => this.update(data));
    bus.on("settings.workspace.space", () => this.space());
  }

  private space(): WorkspaceSpace {
    const activeId = this.config.get("activeWorkspace");
    const workspaces = this.readWorkspaces();
    const ws = workspaces.find((w) => w.id === activeId);
    if (!ws) return { conversations: 0, knowledge: 0, attachments: 0, cwd: 0, total: 0 };

    const dbPath = this.storage.root(`${ws.path}/workspace.db`);
    const ktDbPath = dbPath.replace(/\.db$/, ".kt.db");

    const chatsRoot = this.storage.root(`${ws.path}/chats`);
    const conversations = fileSize(dbPath);
    const knowledge = fileSize(ktDbPath);
    const attachments = chatSubdirSize(chatsRoot, "attachments");
    const cwd = chatSubdirSize(chatsRoot, "cwd");
    const tools = chatSubdirSize(chatsRoot, "tools");

    return { conversations, knowledge, attachments, cwd, tools, total: conversations + knowledge + attachments + cwd + tools };
  }

  private readWorkspaces(): Workspace[] {
    return this.config.get("workspaces") ?? [];
  }

  private list(): { workspaces: Workspace[] } {
    const workspaces = this.readWorkspaces();
    this.log.debug("Listing workspaces", { count: workspaces.length });
    return { workspaces };
  }

  private async add(data: { name: string }): Promise<{ workspace: Workspace }> {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const relPath = `${WORKSPACES_REL}/${slug}`;
    this.storage.mkdir(relPath);

    const workspace: Workspace = {
      id: crypto.randomUUID(),
      name: data.name,
      path: relPath,
      createdAt: new Date().toISOString(),
    };

    await this.config.update("workspaces", (ws) => [...(ws ?? []), workspace]);
    this.log.info("Added workspace", { id: workspace.id, name: workspace.name });
    this.bus.emit("settings.workspace.added", { workspace });
    return { workspace };
  }

  private async remove(data: { id: string }): Promise<{ removed: boolean }> {
    const workspaces = this.readWorkspaces();
    const idx = workspaces.findIndex((w) => w.id === data.id);
    if (idx === -1) return { removed: false };

    const [removed] = workspaces.splice(idx, 1);
    await this.config.set("workspaces", workspaces);

    const activeId = this.config.get("activeWorkspace");
    if (activeId === data.id) {
      const next = workspaces[0]?.id ?? null;
      await this.config.set("activeWorkspace", next ?? undefined);
    }

    this.log.info("Removed workspace", { id: removed.id, name: removed.name });
    return { removed: true };
  }

  private async update(data: { id: string; name?: string; knowledgeSearch?: "keyword" | "hybrid" }): Promise<{ workspace: Workspace }> {
    const workspaces = this.readWorkspaces();
    const workspace = workspaces.find((w) => w.id === data.id);
    if (!workspace) throw new Error(`Workspace not found: ${data.id}`);

    if (data.name !== undefined) {
      const trimmed = data.name.trim();
      if (!trimmed) throw new Error("Workspace name cannot be empty");
      workspace.name = trimmed;
    }
    if (data.knowledgeSearch !== undefined) workspace.knowledgeSearch = data.knowledgeSearch;

    await this.config.set("workspaces", workspaces);
    this.log.info("Updated workspace", { id: workspace.id, name: workspace.name, knowledgeSearch: workspace.knowledgeSearch });
    this.bus.emit("settings.workspace.changed", { workspace });
    return { workspace };
  }

  private getActive(): { activeWorkspace: string | null } {
    return { activeWorkspace: this.config.get("activeWorkspace") ?? null };
  }

  private async setActive(data: { id: string }): Promise<{ activeWorkspace: string }> {
    const workspaces = this.readWorkspaces();
    const workspace = workspaces.find((w) => w.id === data.id);
    await this.config.set("activeWorkspace", data.id);
    this.log.info("Set active workspace", { id: data.id });
    if (workspace) {
      this.bus.emit("settings.workspace.changed", { workspace });
    }
    return { activeWorkspace: data.id };
  }
}

function fileSize(path: string): number {
  let total = 0;
  for (const p of [path, `${path}-wal`, `${path}-shm`]) {
    try { total += statSync(p).size; } catch {}
  }
  return total;
}

function dirSize(dirPath: string): number {
  let total = 0;
  try {
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
      const p = join(dirPath, entry.name);
      if (entry.isDirectory()) total += dirSize(p);
      else try { total += statSync(p).size; } catch {}
    }
  } catch {}
  return total;
}

/** Sum size of chats/{id}/<subdir>/ across all chats */
function chatSubdirSize(chatsDir: string, subdir: string): number {
  let total = 0;
  try {
    for (const entry of readdirSync(chatsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      total += dirSize(join(chatsDir, entry.name, subdir));
    }
  } catch {}
  return total;
}
