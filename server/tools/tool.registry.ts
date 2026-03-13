import { z, toJSONSchema } from "zod/v4";
import type { AgentToolDef, AgentTools, ToolAttachment } from "../core/agent.types";
import type { EventBus } from "../core/bus";
import type { Logger } from "../logger.types";
import type { ToolApproval, ApprovalContext } from "../core/tool.approval";

export interface ToolContext {
  bus: EventBus;
  log: Logger;
  role: string;
  signal: AbortSignal;
  approval: ToolApproval;
  approvalCtx: ApprovalContext;
}

export interface ToolDef<T extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  schema: T;
  category?: string;
  recovery?: string;
  execute: (input: z.infer<T>, ctx: ToolContext) => Promise<string | ToolAttachment>;
  summarize?: (input: z.infer<T>, output: string) => string;
}

export function defineTool<T extends z.ZodObject>(def: ToolDef<T>): ToolDef<T> {
  return def;
}

export function createToolSet(tools: ToolDef[], ctx: ToolContext): AgentTools {
  const map = new Map(tools.map((t) => [t.name, t]));

  const defs: AgentToolDef[] = tools.map((t) => {
    const raw = toJSONSchema(t.schema) as Record<string, unknown>;
    delete raw.$schema;
    delete raw.additionalProperties;
    const parameters = raw as AgentToolDef["parameters"];

    return {
      name: t.name,
      description: t.description,
      parameters,
      category: t.category,
      summarize: t.summarize
        ? (input: unknown, output: string) => t.summarize!(t.schema.parse(input), output)
        : undefined,
    };
  });

  return {
    defs,
    execute: async (name, args) => {
      if (ctx.signal.aborted) return "Error: cancelled";

      const tool = map.get(name);
      if (!tool) return `Error: unknown tool "${name}". Available: ${tools.map((t) => t.name).join(", ")}`;

      const parsed = tool.schema.safeParse(args);
      if (!parsed.success) {
        const issues = (parsed as any).error?.issues?.map((i: any) => i.message).join(", ") ?? "Invalid input";
        const hint = tool.recovery ? `\nRecovery: ${tool.recovery}` : "";
        return `Try again: ${issues}. You sent: ${JSON.stringify(args)}${hint}`;
      }

      try {
        return await tool.execute(parsed.data, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const hint = tool.recovery ? `\nRecovery: ${tool.recovery}` : "";
        return `Error: ${msg}${hint}`;
      }
    },
  };
}
