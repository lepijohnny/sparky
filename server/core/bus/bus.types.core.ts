import type { AuthRequest, AuthVerdict } from "@sparky/auth-core";
import type { RegistryListResponse, ModelDefinition } from "../registry.types";

export interface CoreEvents {
  "storage.ready":              { req: void; res: void };
  "connection.authenticated":   { req: { wsId: string }; res: void };
  "connection.disconnected":    { req: { wsId: string }; res: void };

  "core.config.get":            { req: { key: string }; res: unknown };
  "core.config.set":            { req: { key: string; value: unknown }; res: { ok: boolean } };

  "core.registry.list":         { req: void; res: RegistryListResponse };
  "core.registry.model":        { req: { provider?: string; model?: string }; res: { provider: string; model: string; label: string } };
  "core.registry.models":       { req: { provider: string; connectionId?: string }; res: { models: ModelDefinition[] } };
  "core.registry.validate":     { req: { provider: string; host?: string }; res: { ok: boolean; error?: string } };

  "core.prefetch":              { req: void; res: { ok: boolean } };
  "core.models.ready":          { req: void; res: void };

  "auth.start":                 { req: { domain: string; provider: string; grant: string; params?: Record<string, string> }; res: AuthRequest };
  "auth.finish":                { req: { domain: string; provider: string; grant: string; params?: Record<string, string> }; res: AuthVerdict };

  "cred.get":                   { req: { key: string }; res: { value: string | null } };
  "cred.set":                   { req: { key: string; value: string }; res: {} };
  "cred.delete":                { req: { key: string }; res: {} };
  "cred.list":                  { req: void; res: { keys: string[] } };
  "cred.clear":                 { req: { prefix: string }; res: {} };

  "diagnostics.logs.read":      { req: void; res: { lines: string[] } };

  "debug.recording.set":        { req: { enabled: boolean }; res: { ok: boolean } };
  "debug.recording.get":        { req: void; res: { enabled: boolean } };

  "trust.mode.get":             { req: void; res: { mode: string } };
  "trust.mode.set":             { req: { mode: string }; res: { ok: boolean } };
  "trust.data.get":             { req: void; res: any };
  "trust.rule.add":             { req: { scope: string; list: string; label: string; pattern: string }; res: { ok: boolean } };
  "trust.rule.remove":          { req: { scope: string; list: string; pattern: string }; res: { ok: boolean } };
  "trust.reset":                { req: void; res: { ok: boolean } };
  "trust.clear":                { req: void; res: { ok: boolean } };
  "trust.changed":              { req: any; res: void };

  "fs.complete":                { req: { partial: string }; res: { entries: { name: string; isDir: boolean }[]; base: string } };
}
