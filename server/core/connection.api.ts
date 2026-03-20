import type { BusEventMap } from "./bus";

interface RouteOptions {
  notifiable?: boolean;
}

type RouteEntry = keyof BusEventMap | [keyof BusEventMap, RouteOptions];

const ROUTES: RouteEntry[] = [
  "settings.appearance.theme.list",
  ["settings.appearance.theme.set", { notifiable: true }],
  ["settings.appearance.theme.save", { notifiable: true }],

  "settings.environment.list",

  "settings.labels.list",
  ["settings.labels.create", { notifiable: true }],
  ["settings.labels.update", { notifiable: true }],
  ["settings.labels.delete", { notifiable: true }],
  ["settings.labels.reorder", { notifiable: true }],

  "settings.llm.connections.list",
  ["settings.llm.connections.add", { notifiable: true }],
  ["settings.llm.connections.update", { notifiable: true }],
  ["settings.llm.connections.remove", { notifiable: true }],
  "settings.llm.default.get",
  ["settings.llm.default.set", { notifiable: true }],

  "settings.profile.get",
  ["settings.profile.set", { notifiable: true }],

  "settings.workspace.list",
  ["settings.workspace.add", { notifiable: true }],
  ["settings.workspace.remove", { notifiable: true }],
  ["settings.workspace.update", { notifiable: true }],
  "settings.workspace.space",
  "settings.workspace.active.get",
  ["settings.workspace.active.set", { notifiable: true }],

  "settings.sandbox.status",
  "settings.sandbox.images",
  "settings.sandbox.allowlist.list",
  ["settings.sandbox.allowlist.add", { notifiable: true }],
  ["settings.sandbox.allowlist.remove", { notifiable: true }],

  "core.registry.list",
  "core.registry.model",
  "core.registry.models",
  "core.registry.validate",

  "chat.counts",
  "chat.list",
  "chat.list.all",
  "chat.list.flagged",
  "chat.list.archived",
  "chat.list.labeled",
  ["chat.create", { notifiable: true }],
  ["chat.delete", { notifiable: true }],
  ["chat.rename", { notifiable: true }],
  ["chat.flag", { notifiable: true }],
  ["chat.archive", { notifiable: true }],
  ["chat.label", { notifiable: true }],
  ["chat.model", { notifiable: true }],
  ["chat.thinking", { notifiable: true }],
  ["chat.knowledge", { notifiable: true }],
  ["chat.mode", { notifiable: true }],
  "chat.get.id",
  "chat.entries",
  "chat.anchor.add",
  "chat.anchor.remove",
  "chat.anchor.rename",
  "chat.anchored",

  "chat.attachment.add",
  "chat.attachment.remove",
  "chat.attachment.list",
  "chat.ask",
  "chat.stop",
  "chat.search",
  "chat.system.ask",
  "tool.approval.pending",
  "tool.approval.resolve",

  ["kt.sources.add.file", { notifiable: true }],
  ["kt.sources.add.folder", { notifiable: true }],
  ["kt.sources.add.url", { notifiable: true }],
  ["kt.sources.delete", { notifiable: true }],
  "kt.sources.list",
  "kt.sources.count",
  "kt.sources.get",
  ["kt.sources.reindex", { notifiable: true }],
  ["kt.sources.cancel", { notifiable: true }],
  "kt.sources.extensions",

  "extractors.list",
  "extractors.options.get",
  ["extractors.options.set", { notifiable: true }],

  "auth.start",
  "auth.finish",

  "cred.get",
  "cred.set",
  "cred.delete",
  "cred.list",
  "cred.clear",

  "trust.mode.get",
  ["trust.mode.set", { notifiable: true }],
  "trust.data.get",
  ["trust.rule.add", { notifiable: true }],
  ["trust.rule.remove", { notifiable: true }],
  ["trust.reset", { notifiable: true }],
  ["trust.clear", { notifiable: true }],

  "core.prefetch",

  "diagnostics.logs.read",

  "debug.recording.set",
  "debug.recording.get",

  "svc.register",
  "svc.list",
  "svc.list.compact",
  "svc.call",
  "svc.test",
  "svc.describe",
  ["svc.delete", { notifiable: true }],
  ["svc.guide", { notifiable: true }],
  "svc.guide.read",
  "svc.oauth.start",
  "svc.oauth.finish",

];

/** All routes clients are allowed to call via WebSocket. */
export const API = new Set<keyof BusEventMap>(
  ROUTES.map((r) => (Array.isArray(r) ? r[0] : r)),
);

/** Routes that support async notify + toast. */
export const NOTIFIABLE = new Set<keyof BusEventMap>(
  ROUTES.filter((r): r is [keyof BusEventMap, RouteOptions] => Array.isArray(r) && !!r[1].notifiable)
    .map((r) => r[0]),
);
