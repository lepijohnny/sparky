import { z } from "zod/v4";
import { defineTool, trunc } from "./tool.registry";
import { guide } from "../core/assistant/assistant.tools.guide";
import { BUS_EVENTS } from "../core/bus";

function svcLabel(id: string): string {
  return id.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function summarize(input: { event: string; params?: Record<string, unknown> }, output: string): string {
  const event = input.event;

  if (event === "svc.call" && input.params?.service) {
    const label = svcLabel(input.params.service as string);
    const body = input.params.body as Record<string, unknown> | undefined;
    const query = body?.q ?? body?.query ?? input.params.query;
    if (query) return `${label}: ${String(query).slice(0, 48)}`;
    const action = input.params.action ? ` → ${input.params.action}` : "";
    return `${label}${action}`;
  }

  if (event === "svc.register" && input.params?.label) {
    return `Registering ${input.params.label}`;
  }

  if (event === "svc.test" && input.params?.service) {
    return `Testing ${svcLabel(input.params.service as string)}`;
  }

  try {
    const parsed = JSON.parse(output);

    if (event === "chat.label" && parsed?.chat) {
      const name = parsed.chat.name ?? "";
      const labels = parsed.chat.labels as string[] | undefined;
      if (!labels?.length) return name ? `"${name}" unlabeled` : "Unlabeled";
      return name ? `"${name}" labeled` : "Labeled";
    }

    if (event === "chat.flag" && parsed?.chat) {
      const name = parsed.chat.name ?? "";
      return parsed.chat.flagged ? (name ? `Flagged "${name}"` : "Flagged") : (name ? `Unflagged "${name}"` : "Unflagged");
    }

    if (event === "chat.archive" && parsed?.chat) {
      const name = parsed.chat.name ?? "";
      return parsed.chat.archived ? (name ? `Archived "${name}"` : "Archived") : (name ? `Unarchived "${name}"` : "Unarchived");
    }

    if (parsed?.ok === false) return "Cancelled";

    if (parsed?.ok === true) {
      return event.includes("delete") ? "Deleted"
        : event.includes("create") ? "Created"
        : event.includes("rename") ? "Renamed"
        : event.includes("set") ? "Updated"
        : "Done";
    }

    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) return `Listed ${key}, ${parsed[key].length} found`;
    }

    if (parsed?.chat?.name) return `"${parsed.chat.name}"`;
    if (parsed?.name) return `"${parsed.name}"`;

    return "Done";
  } catch {
    return output.length > 48 ? `${output.slice(0, 48)}…` : output;
  }
}

export const busEmit = defineTool({
  name: "app_bus_emit",
  label: "App",
  icon: "wrench",
  description: "Call an app bus event. 'event' is the event name, 'params' is the arguments object. Read API reference before calling.",
  schema: z.object({
    event: z.string().describe("Bus event name, e.g. 'chat.create'"),
    params: z.record(z.string(), z.unknown()).optional().describe("Event parameters as an object, e.g. { name: 'My Chat' }"),
  }),
  trustScope: "bus",
  trustTarget: (input) => {
    const params = input.params as Record<string, unknown> | undefined;
    if (input.event === "svc.call" && params?.service) return `svc.call:${params.service}`;
    return input.event;
  },
  recovery: "Read the API docs first: app_read(\"api/<domain>.md\") to see available events and their expected params.",
  friendlyLabel: (input) => {
    const event = input.event;
    const params = input.params as Record<string, unknown> | undefined;
    if (event === "svc.call" && params?.service) {
      const label = svcLabel(String(params.service));
      const body = params.body as Record<string, unknown> | undefined;
      const query = body?.q ?? body?.query ?? params.query;
      if (query) return `${label}: ${trunc(String(query))}`;
      return `Calling ${label}`;
    }
    if (event === "svc.describe") {
      const service = params?.service;
      return service ? `Exploring ${svcLabel(String(service))} API` : "Exploring service API";
    }
    if (event === "svc.register") {
      const label = params?.label;
      return label ? `Connecting ${String(label)}` : "Connecting service";
    }
    if (event === "svc.test") {
      const service = params?.service;
      return service ? `Testing ${svcLabel(String(service))}` : "Testing service";
    }
    if (event.startsWith("settings.")) return "Updating settings";
    if (event.startsWith("kt.")) return "Knowledge base";
    return event;
  },
  summarize,
  async execute(input, ctx) {
    if (input.event.startsWith("app_")) {
      return `Error: "${input.event}" is a tool, not a bus event. Call it directly as a function call.`;
    }

    const eventDef = BUS_EVENTS[input.event];
    const params = input.params ?? {};

    const guideError = guide(input.event, params);
    if (guideError) {
      ctx.log.warn("Guide validation failed", { event: input.event, error: guideError });
      if (eventDef?.hooks?.onError) {
        const busProxy = { emit: (e: string, d: unknown) => ctx.bus.emit(e as any, d) };
        const custom = await eventDef.hooks.onError(params, guideError, busProxy);
        if (custom) return custom;
      }
      return `Your params are wrong. Fix them and try again: ${guideError}`;
    }

    const approvalHook = eventDef?.hooks?.requestApproval?.(params);
    if (approvalHook) {
      const ok = await ctx.approvalCtx.requestApproval("app_bus_emit", approvalHook.label, {
        type: approvalHook.type,
        ...approvalHook.meta,
        timeoutMs: approvalHook.timeoutMs ?? 30_000,
      });
      if (!ok) throw new Error("Denied by the user.");
      if (approvalHook.successMessage) return approvalHook.successMessage;
    }

    ctx.log.info("app_bus_emit", { event: input.event, params });
    const result = await ctx.bus.emit(input.event as any, params);
    if (result === undefined) return `Error: unknown event "${input.event}". Read the API docs: app_read("api/<domain>.md")`;
    return JSON.stringify(result);
  },
});
