/**
 * Agent streaming loop — processes agent events and maps them to chat entries.
 */
import type { Agent, AgentEvent, AgentMessage, AgentTools } from "../core/agent.types";
import type { ChatEntry } from "./chat.types";

type TerminalReason = "done" | "stopped" | "error";

type EmitFn = (chatId: string, entry: ChatEntry) => Promise<void>;
type EmitActivityFn = (chatId: string, turnId: string, type: string, data?: any) => Promise<void>;

export async function runAgentLoop(
  agent: Agent,
  chatId: string,
  turnId: string,
  system: string,
  messages: AgentMessage[],
  signal: AbortSignal,
  emit: EmitFn,
  emitActivity: EmitActivityFn,
  tools?: AgentTools,
): Promise<TerminalReason> {
  try {
    const stream = agent.stream({ system, messages, cancellation: signal, tools });
    const pendingTools = new Map<string, { name: string; input: unknown }>();

    for await (const event of stream) {
      if (signal.aborted) return "stopped";

      if (event.type === "tool.start") {
        pendingTools.set(event.id, { name: event.name, input: event.input });
      }

      const entry = toEntry(event, turnId, tools, pendingTools);
      if (entry) await emit(chatId, entry);
    }

    return signal.aborted ? "stopped" : "done";
  } catch (err) {
    if (signal.aborted) return "stopped";
    await emitActivity(chatId, turnId, "agent.error", { message: String(err) });
    return "error";
  }
}

function toEntry(
  event: AgentEvent,
  messageId: string,
  tools?: AgentTools,
  pendingTools?: Map<string, { name: string; input: unknown }>,
): ChatEntry | null {
  const timestamp = new Date().toISOString();

  switch (event.type) {
    case "text.delta":
      return { kind: "activity", messageId, source: "agent", type: "agent.text.delta", timestamp, data: { content: event.content } };
    case "text.done":
      return { kind: "message", id: messageId, role: "assistant", content: event.content, timestamp };
    case "thinking.start":
      return { kind: "activity", messageId, source: "agent", type: "agent.thinking.start", timestamp };
    case "thinking.delta":
      return { kind: "activity", messageId, source: "agent", type: "agent.thinking.delta", timestamp, data: { content: event.content } };
    case "thinking.done":
      return { kind: "activity", messageId, source: "agent", type: "agent.thinking.done", timestamp, data: { content: event.content } };
    case "tool.start": {
      const cleanName = stripToolPrefix(event.name);
      const def = tools?.defs.find((d) => d.name === cleanName);
      const category = def?.category ?? inferCategory(cleanName, event.input);
      return { kind: "activity", messageId, source: "agent", type: "agent.tool.start", timestamp, data: { id: event.id, name: cleanName, input: event.input, category } };
    }
    case "tool.result": {
      const pending = pendingTools?.get(event.id);
      const toolName = pending ? stripToolPrefix(pending.name) : "";
      const def = tools?.defs.find((d) => d.name === toolName);
      const output = String(event.output);
      const summary = def?.summarize?.(pending?.input, output) ?? fallbackSummary(output);
      const category = def?.category ?? inferCategory(toolName, pending?.input);
      return { kind: "activity", messageId, source: "agent", type: "agent.tool.result", timestamp, data: { id: event.id, output: event.output, summary, category } };
    }
    case "tool.denied":
      return { kind: "activity", messageId, source: "agent", type: "agent.tool.denied", timestamp, data: { id: event.id } };
    case "server_tool.start": {
      const category = inferCategory(event.name, event.input);
      return { kind: "activity", messageId, source: "agent", type: "agent.tool.start", timestamp, data: { id: event.id, name: event.name, input: event.input, category } };
    }
    case "error":
      return { kind: "activity", messageId, source: "agent", type: "agent.error", timestamp, data: { message: event.message } };
    case "done":
      return null;
    default:
      return null;
  }
}

export function stripToolPrefix(name: string): string {
  return name.replace(/^mcp__[^_]+__/, "");
}

export function inferCategory(toolName: string, input: unknown): string {
  if (toolName === "web_search" || toolName === "app_web_search") return "search";
  if (toolName === "app_bus_emit") {
    const event = (input as any)?.event as string ?? "";
    if (event.startsWith("settings.labels")) return "label";
    if (event.startsWith("settings.llm")) return "connection";
    if (event.startsWith("settings.workspace")) return "workspace";
    if (event.startsWith("settings.appearance")) return "theme";
    if (event.startsWith("chat.label")) return "label";
    if (event.startsWith("chat")) return "chat";
    return "system";
  }
  return "system";
}

export function fallbackSummary(output: string): string {
  try {
    const parsed = JSON.parse(output);
    if (parsed?.ok === true) return "Done";
    for (const key of Object.keys(parsed)) {
      if (Array.isArray(parsed[key])) return `${parsed[key].length} ${key}`;
    }
    if (parsed?.name) return `"${parsed.name}"`;
  } catch {}
  return output.length > 48 ? `${output.slice(0, 48)}…` : output;
}
