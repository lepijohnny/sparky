import type { ThemeFile } from "../../settings/appearance.types";
import type { EnvEntry } from "../../settings/environment.types";
import type { Label } from "../../settings/labels.types";
import type { LlmConnection, LlmDefault } from "../../settings/llm.types";
import type { Profile } from "../../settings/profile.types";
import type { Workspace, WorkspaceSpace } from "../../settings/workspace.types";
import type { QemuStatus, SandboxImage } from "../sandbox/sandbox.types";

export interface SettingsEvents {
  "settings.appearance.theme.changed":  { req: { theme: ThemeFile }; res: void };
  "settings.appearance.theme.created":  { req: { theme: ThemeFile }; res: void };
  "settings.appearance.theme.list":     { req: void; res: { themes: ThemeFile[] } };
  "settings.appearance.theme.set":      { req: { name: string }; res: { theme: ThemeFile } };
  "settings.appearance.theme.save":     { req: { theme: ThemeFile }; res: { theme: ThemeFile } };

  "settings.environment.list":          { req: void; res: { entries: EnvEntry[] } };

  "settings.llm.connections.list":      { req: void; res: { connections: LlmConnection[] } };
  "settings.llm.connections.add":       { req: Omit<LlmConnection, "id" | "createdAt" | "credPrefix">; res: { connection: LlmConnection } };
  "settings.llm.connections.remove":    { req: { id: string }; res: { removed: boolean } };
  "settings.llm.connections.update":    { req: { id: string; model?: string; thinking?: number; assistant?: boolean }; res: { connection: LlmConnection } };
  "settings.llm.default.get":          { req: void; res: { default: LlmDefault | null } };
  "settings.llm.default.set":          { req: LlmDefault; res: { default: LlmDefault } };

  "settings.profile.get":              { req: void; res: { profile: Profile } };
  "settings.profile.set":              { req: Partial<Profile>; res: { profile: Profile } };
  "settings.profile.changed":          { req: { profile: Profile }; res: void };

  "settings.workspace.list":           { req: void; res: { workspaces: Workspace[] } };
  "settings.workspace.add":            { req: { name: string }; res: { workspace: Workspace } };
  "settings.workspace.remove":         { req: { id: string }; res: { removed: boolean } };
  "settings.workspace.active.get":     { req: void; res: { activeWorkspace: string | null } };
  "settings.workspace.active.set":     { req: { id: string }; res: { activeWorkspace: string } };
  "settings.workspace.update":         { req: { id: string; name?: string; knowledgeSearch?: "keyword" | "hybrid" }; res: { workspace: Workspace } };
  "settings.workspace.space":          { req: void; res: WorkspaceSpace };
  "settings.workspace.changed":        { req: { workspace: Workspace }; res: void };
  "settings.workspace.added":          { req: { workspace: Workspace }; res: void };

  "settings.sandbox.status":           { req: void; res: QemuStatus };
  "settings.sandbox.images":           { req: void; res: { images: SandboxImage[] } };
  "settings.sandbox.allowlist.list":   { req: void; res: { entries: string[] } };
  "settings.sandbox.allowlist.add":    { req: { host: string }; res: { entry: string } };
  "settings.sandbox.allowlist.remove": { req: { host: string }; res: { removed: boolean } };

  "settings.labels.list":             { req: void; res: { labels: Label[] } };
  "settings.labels.create":           { req: { name: string; color?: string }; res: { label: Label } };
  "settings.labels.update":           { req: { id: string; name?: string; color?: string }; res: { label: Label } };
  "settings.labels.delete":           { req: { id: string }; res: { deleted: boolean } };
  "settings.labels.reorder":          { req: { ids: string[] }; res: { labels: Label[] } };
  "settings.labels.created":          { req: { label: Label }; res: void };
  "settings.labels.updated":          { req: { label: Label }; res: void };
  "settings.labels.deleted":          { req: { id: string }; res: void };
}
