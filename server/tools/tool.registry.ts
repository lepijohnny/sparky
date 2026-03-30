import { z, toJSONSchema } from "zod/v4";
import type { AgentToolDef, AgentTools, ToolAttachment } from "../core/agent.types";
import type { EventBus } from "../core/bus";
import type { Logger } from "../logger.types";
import type { ApprovalContext } from "../core/tool.approval";
import type { Scope, TrustStore } from "../core/trust";

export interface ToolContext {
  bus: EventBus;
  log: Logger;
  role: string;
  signal: AbortSignal;
  approvalCtx: ApprovalContext;
  trust: TrustStore;
  envVars?: Record<string, string>;
  cwd?: string;
  skillApproved?: boolean;
  /** Injected by createToolSet — forwards a call to another tool in the set. */
  forward?: (tool: string, args: Record<string, unknown>) => Promise<string | ToolAttachment>;
}

export interface ToolSet extends AgentTools {
  forward(tool: string, args: Record<string, unknown>): Promise<string | ToolAttachment>;
}

export interface ToolDef<T extends z.ZodObject = z.ZodObject> {
  name: string;
  label: string;
  icon: string;
  description: string;
  schema: T;
  trustScope?: Scope;
  trustTarget?: (input: z.infer<T>) => string;
  category?: string;
  recovery?: string;
  execute: (input: z.infer<T>, ctx: ToolContext) => Promise<string | ToolAttachment>;
  summarize?: (input: z.infer<T>, output: string) => string;
  /** Human-friendly label shown in the activity UI (e.g. `Reading package.json`). */
  friendlyLabel?: (input: z.infer<T>) => string;
  /** Max output chars before saving to disk. Defaults to 32_000. */
  outputLimit?: number;
}

export const DEFAULT_OUTPUT_LIMIT = 32_000;

export function defineTool<T extends z.ZodObject>(def: ToolDef<T>): ToolDef<T> {
  return def;
}

export function trunc(s: string, max = 48): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export function createToolSet(tools: ToolDef[], baseCtx: ToolContext): ToolSet {
  const map = new Map(tools.map((t) => [t.name, t]));

  const defs: AgentToolDef[] = tools.map((t) => {
    const raw = toJSONSchema(t.schema) as Record<string, unknown>;
    delete raw.$schema;
    delete raw.additionalProperties;
    const parameters = raw as AgentToolDef["parameters"];

    return {
      name: t.name,
      description: t.description,
      label: t.label,
      icon: t.icon,
      parameters,
      category: t.category,
      summarize: t.summarize
        ? (input: unknown, output: string) => t.summarize!(t.schema.parse(input), output)
        : undefined,
      friendlyLabel: t.friendlyLabel
        ? (input: unknown) => t.friendlyLabel!(t.schema.parse(input))
        : undefined,
      outputLimit: t.outputLimit,
    };
  });

  const ctx: ToolContext = { ...baseCtx, forward: (tool, args) => execute(tool, args) };

  const execute = async (name: string, args: unknown): Promise<string | ToolAttachment> => {
      if (ctx.signal.aborted) return "Error: cancelled";

      const tool = map.get(name);
      if (!tool) return `Error: unknown tool "${name}". Available: ${tools.map((t) => t.name).join(", ")}`;

      const parsed = tool.schema.safeParse(args);
      if (!parsed.success) {
        const issues = (parsed as any).error?.issues?.map((i: any) => i.message).join(", ") ?? "Invalid input";
        const hint = tool.recovery ? `\nRecovery: ${tool.recovery}` : "";
        return `Try again: ${issues}. You sent: ${JSON.stringify(args)}${hint}`;
      }

      if (tool.trustScope && tool.trustTarget) {
        const target = tool.trustTarget(parsed.data);
        const { decision, rule } = ctx.trust.resolve(tool.trustScope, target);
        ctx.log.info("Trust gate", { tool: name, scope: tool.trustScope, target, decision, rule: rule?.label });
        if (decision === "deny") {
          await ctx.bus.emit("chat.event", {
            chatId: ctx.approvalCtx.chatId,
            kind: "activity",
            messageId: ctx.approvalCtx.turnId ?? "",
            source: "agent",
            type: "agent.trust.denied",
            timestamp: new Date().toISOString(),
            data: { scope: tool.trustScope, tool: name, target, rule: rule?.label },
          });
          return `Blocked by trust rules: ${rule?.label ?? target}`;
        }
        if (decision === "prompt" && !(ctx.skillApproved && !rule)) {
          const chatAllowed = !rule?.alwaysAsk && ctx.approvalCtx.isChatAllowed(tool.trustScope);
          if (!chatAllowed) {
            const ok = await ctx.approvalCtx.requestApproval(name, target, { type: "confirm:yesno", alwaysAsk: rule?.alwaysAsk });
            if (!ok) {
              const hint = rule?.alwaysAsk
                ? " This action requires approval every time — it cannot be auto-approved."
                : " The user may choose 'Approve all' next time to skip future prompts.";
              return `Denied by the user.${hint}`;
            }
          }
        }
      }

      try {
        return await tool.execute(parsed.data, ctx);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const hint = tool.recovery ? `\nRecovery: ${tool.recovery}` : "";
        return `Error: ${msg}${hint}`;
      }
  };

  return { defs, execute, forward: ctx.forward! };
}
