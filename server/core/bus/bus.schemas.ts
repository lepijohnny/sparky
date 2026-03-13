import { z } from "zod";
import { ServiceSchema, formatZodError } from "../proxy/proxy.schema";
import { type ApprovalRequestType, chooseApprovalRequestType } from "../tool.approval";

const SvcRequestInput = z.object({
  service: z.string().min(1, 'Provide a lowercase service name, e.g. "github"'),
  title: z.string().min(1, 'Provide a short title like "GitHub Setup"'),
  fields: z.array(z.object({
    name: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "Field name must be UPPERCASE, e.g. TOKEN"),
    label: z.string(),
    type: z.string(),
  })).min(1, "Provide at least one field"),
  oauth: z.object({
    authUrl: z.url(),
    tokenUrl: z.url(),
    scopes: z.array(z.string()).min(1, "Provide at least one scope"),
    tokenKey: z.string().min(1, 'Provide the token field name, e.g. "TOKEN"'),
  }).optional(),
});

const SvcCall = z.object({
  service: z.string().min(1, 'Provide the service name, e.g. "todoist"'),
  action: z.string().min(1, 'Provide the endpoint name, e.g. "list_tasks". Use svc.list.compact to see available endpoints.'),
  params: z.record(z.string(), z.unknown()).optional().describe("Endpoint parameters as an object. Omit for no-arg endpoints."),
});

const SvcTest = z.object({
  service: z.string().min(1, 'Provide the service name to test, e.g. "github"'),
});

const SvcDelete = z.object({
  service: z.string().min(1, 'Provide the service name to delete, e.g. "todoist"'),
});

const SvcGuide = z.object({
  service: z.string().min(1, 'Provide the service name, e.g. "github"'),
  content: z.string().min(1, "Provide the markdown guide content"),
});

const ChatCreate = z.object({
  name: z.string().optional().describe("Optional chat name"),
});

const ChatRename = z.object({
  id: z.string().min(1, "Provide the chat ID"),
  name: z.string().min(1, "Provide the new name"),
});

const ChatFlag = z.object({
  id: z.string().min(1, "Provide the chat ID"),
  flagged: z.boolean().describe("true to flag, false to unflag"),
});

const ChatArchive = z.object({
  id: z.string().min(1, "Provide the chat ID"),
  archived: z.boolean().describe("true to archive, false to unarchive"),
});

const ChatLabel = z.object({
  id: z.string().min(1, "Provide the chat ID"),
  labels: z.array(z.string()).describe("Array of label IDs to assign"),
});

const LabelsCreate = z.object({
  name: z.string().min(1, "Provide the label name"),
  color: z.string().optional().describe('Optional hex color, e.g. "#ff0000"'),
});

const LabelsUpdate = z.object({
  id: z.string().min(1, "Provide the label ID"),
  name: z.string().optional(),
  color: z.string().optional(),
});

const LabelsDelete = z.object({
  id: z.string().min(1, "Provide the label ID"),
});

const SandboxAllowlistAdd = z.object({
  host: z.string().min(1, 'Provide the hostname, e.g. "api.example.com"'),
});

const SandboxAllowlistRemove = z.object({
  host: z.string().min(1, "Provide the hostname to remove"),
});

const KtSourcesAddFile = z.object({
  path: z.string().min(1, "Provide the file path"),
});

const KtSourcesAddFolder = z.object({
  path: z.string().min(1, "Provide the folder path"),
});

const KtSourcesAddUrl = z.object({
  url: z.string().url("Provide a valid URL"),
});

const KtSearch = z.object({
  query: z.string().min(1, "Provide a search query"),
  limit: z.number().optional().describe("Max results (default 10)"),
});

const WebSearch = z.object({
  query: z.string().min(1, "Provide a search query"),
  maxResults: z.number().optional().describe("Max results (default 10)"),
});

const WebRead = z.object({
  url: z.string().url("Provide a valid URL to read"),
});

export interface BusEventHooks {
  onError?: (params: Record<string, unknown> | undefined, error: string, bus: { emit: (event: string, data: unknown) => Promise<unknown> }) => Promise<string | null>;
  requestApproval?: (params: Record<string, unknown> | undefined) => {
    type: ApprovalRequestType;
    label: string;
    timeoutMs?: number;
    successMessage?: string;
    meta?: Record<string, unknown>;
  } | null;
}

export interface DestructiveAction {
  message: string;
}

export function destructive(message: string): DestructiveAction {
  return { message };
}

export interface BusEventDef {
  schema: z.ZodTypeAny;
  destructive?: DestructiveAction;
  hooks?: BusEventHooks;
}

function def(schema: z.ZodTypeAny, action?: DestructiveAction, hooks?: BusEventHooks): BusEventDef {
  return { schema, ...(action ? { destructive: action } : {}), ...(hooks ? { hooks } : {}) };
}

export const BUS_EVENTS: Record<string, BusEventDef> = {
  "svc.request.input": def(SvcRequestInput, undefined, {
    requestApproval: (params) => ({
      type: chooseApprovalRequestType(params),
      label: (params?.title as string) ?? "Service Setup",
      timeoutMs: 600_000,
      successMessage: "Credentials stored successfully. Proceed to register the service with svc.register, then verify the connection.",
      meta: params as Record<string, unknown>,
    }),
  }),
  "svc.register": def(ServiceSchema),
  "svc.describe": def(SvcTest),
  "svc.call": def(SvcCall, undefined, {
    async onError(params, error, bus) {
      const svcId = params?.service as string | undefined;
      if (svcId) {
        const details = await bus.emit("svc.describe", { service: svcId });
        return `Your params are wrong. Fix them and call again.\n\n${error}\n\nService details:\n${JSON.stringify(details, null, 2)}`;
      }
      const list = await bus.emit("svc.list.compact", undefined) as any;
      const svcs = list?.services as any[] | undefined;
      if (Array.isArray(svcs) && svcs.length > 0) {
        return `Your params are wrong — "service" is required.\n\n${error}\n\nAvailable services: ${svcs.map((s: any) => s.id).join(", ")}`;
      }
      return null;
    },
  }),
  "svc.test": def(SvcTest),
  "svc.delete": def(SvcDelete, destructive("Delete service")),
  "svc.guide": def(SvcGuide),

  "chat.create": def(ChatCreate),
  "chat.rename": def(ChatRename, destructive("Rename chat")),
  "chat.flag": def(ChatFlag),
  "chat.archive": def(ChatArchive, destructive("Archive chat")),
  "chat.label": def(ChatLabel),

  "settings.labels.create": def(LabelsCreate),
  "settings.labels.update": def(LabelsUpdate),
  "settings.labels.delete": def(LabelsDelete, destructive("Delete label")),

  "settings.sandbox.allowlist.add": def(SandboxAllowlistAdd),
  "settings.sandbox.allowlist.remove": def(SandboxAllowlistRemove, destructive("Remove from allowlist")),

  "kt.sources.add.file": def(KtSourcesAddFile),
  "kt.sources.add.folder": def(KtSourcesAddFolder),
  "kt.sources.add.url": def(KtSourcesAddUrl),
  "kt.search": def(KtSearch),

  "web.search": def(WebSearch),
  "web.read": def(WebRead),
};

export const BUS_SCHEMAS: Record<string, z.ZodTypeAny> = Object.fromEntries(
  Object.entries(BUS_EVENTS).map(([k, v]) => [k, v.schema])
);

export class BusValidationError extends Error {
  constructor(
    public readonly event: string,
    public readonly hint: string,
    public readonly expectedShape: Record<string, string>,
  ) {
    super(`Invalid params for "${event}": ${hint}`);
    this.name = "BusValidationError";
  }
}

export function validateBusEvent(event: string, data: unknown): BusValidationError | null {
  const schema = BUS_SCHEMAS[event];
  if (!schema) return null;

  const { success, error } = schema.safeParse(data);
  if (success) return null;

  const hint = formatZodError(error);
  const shape = describeSchema(schema);
  return new BusValidationError(event, hint, shape);
}

function describeSchema(schema: z.ZodTypeAny): Record<string, string> {
  if (schema instanceof z.ZodObject) {
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
      const isOpt = val.isOptional();
      const desc = val.description ?? "required";
      result[key] = isOpt ? `(optional) ${desc}` : desc;
    }
    return result;
  }
  return {};
}
