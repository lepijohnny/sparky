import { z } from "zod/v4";
import { defineTool } from "./tool.registry";
import { guide } from "../core/assistant/assistant.tools.guide";
import { BUS_EVENTS } from "../core/bus";

function summarize(input: { event: string; params?: Record<string, unknown> }, output: string): string {
  const event = input.event;
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
  description:
    "Call an application bus event. The 'event' field is the event name and 'params' is a separate object with the event arguments. Never combine them into one string.",
  schema: z.object({
    event: z.string().describe("Bus event name exactly as listed in the API docs, e.g. 'settings.sandbox.allowlist.add'"),
    params: z.record(z.string(), z.unknown()).optional().describe("Event parameters as an object"),
  }),
  trustScope: "bus",
  trustTarget: (input) => input.event,
  recovery: "Read the API docs first: app_read(\"api/<domain>.md\") to see available events and their expected params.",
  summarize,
  async execute(input, ctx) {
    if (input.event.startsWith("app_")) {
      return `Error: "${input.event}" is a tool, not a bus event. Call it directly as a function call.`;
    }

    const eventDef = BUS_EVENTS[input.event];

    const guideError = guide(input.event, input.params);
    if (guideError) {
      ctx.log.warn("Guide validation failed", { event: input.event, error: guideError });
      if (eventDef?.hooks?.onError) {
        const busProxy = { emit: (e: string, d: unknown) => ctx.bus.emit(e as any, d) };
        const custom = await eventDef.hooks.onError(input.params, guideError, busProxy);
        if (custom) return custom;
      }
      return `Your params are wrong. Fix them and try again: ${guideError}`;
    }

    const approvalHook = eventDef?.hooks?.requestApproval?.(input.params);
    if (approvalHook) {
      const ok = await ctx.approvalCtx.requestApproval("app_bus_emit", approvalHook.label, {
        type: approvalHook.type,
        ...approvalHook.meta,
        timeoutMs: approvalHook.timeoutMs ?? 30_000,
      });
      if (!ok) throw new Error("Denied by the user.");
      if (approvalHook.successMessage) return approvalHook.successMessage;
    }

    ctx.log.info("app_bus_emit", { event: input.event, params: input.params });
    const result = await ctx.bus.emit(input.event as any, input.params);
    if (result === undefined) return `Error: unknown event "${input.event}". Read the API docs: app_read("api/<domain>.md")`;
    return JSON.stringify(result);
  },
});
