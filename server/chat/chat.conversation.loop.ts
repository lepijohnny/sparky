/**
 * Agent streaming loop — processes agent events and maps them to chat entries.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Agent, AgentEvent, AgentMessage, AgentTools } from "../core/agent.types";
import type { Logger } from "../logger.types";
import { DEFAULT_OUTPUT_LIMIT } from "../tools/tool.registry";
import type { ChatEntry } from "./chat.types";
import { computeSimilaritySignature, compareSimilaritySignatures, serializeSignature, deserializeSignature } from "../tools/tool.minhash";

type TerminalReason = "done" | "stopped" | "error" | "overflow";

/** Drop ~30% of the oldest conversation turns to recover from context overflow. */
function dropOldestTurns(messages: AgentMessage[]): AgentMessage[] {
  if (messages.length <= 2) return messages;
  const toDrop = Math.max(2, Math.ceil(messages.length * 0.3));
  let dropped = 0;
  let i = 0;
  while (i < messages.length && dropped < toDrop) {
    if (messages[i].role === "user") dropped++;
    i++;
    while (i < messages.length && messages[i].role !== "user") i++;
  }
  return messages.slice(i > 0 ? i : toDrop);
}

type EmitFn = (chatId: string, entry: ChatEntry) => Promise<void>;
type EmitActivityFn = (chatId: string, turnId: string, type: string, data?: any) => Promise<void>;

export function runAgentLoop(
  agent: Agent,
  chatId: string,
  turnId: string,
  system: string,
  messages: AgentMessage[],
  signal: AbortSignal,
  emit: EmitFn,
  emitActivity: EmitActivityFn,
  tools?: AgentTools,
  toolOutputDir?: string,
  steering?: () => string | null,
  log?: Logger,
): Promise<TerminalReason> {
  return agentStream({
    run: (msgs) => agent.stream({ system, messages: msgs, cancellation: signal, tools, steering }),
    messages,
    signal,
    onEvent: async (event, pendingTools) => {
      if (event.type === "tool.result" && toolOutputDir) {
        const pending = pendingTools.get(event.id);
        const toolName = pending ? stripToolPrefix(pending.name) : "";
        const def = tools?.defs.find((d) => d.name === toolName);
        const limit = def?.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
        const similarPath = saveLargeOutput(toolOutputDir, event.id, String(event.output), limit);
        if (similarPath) {
          log?.info("Dedup: similar tool output found", { toolCallId: event.id, similarTo: similarPath });
          (event as any).output = `[Similar result already available at ${similarPath}. Use app_read with offset/limit to inspect it.]`;
        }
      }
      const entry = toEntry(event, turnId, tools, pendingTools);
      if (entry) await emit(chatId, entry);
    },
    onError: (msg) => emitActivity(chatId, turnId, "agent.error", { message: msg }),
  }).retry(3);
}

const SIMILARITY_THRESHOLD = 0.85;

function findSimilarFile(dir: string, output: string): string | null {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".sig"));
    if (files.length === 0) return null;

    const sig = computeSimilaritySignature(output);
    for (const sigFile of files) {
      const buf = readFileSync(join(dir, sigFile));
      const existing = deserializeSignature(buf);
      if (compareSimilaritySignatures(sig, existing) >= SIMILARITY_THRESHOLD) {
        return join(dir, sigFile.replace(/\.sig$/, ".txt"));
      }
    }
  } catch { /* best-effort */ }
  return null;
}

function saveLargeOutput(dir: string, toolCallId: string, output: string, limit: number): string | null {
  if (output.length < limit) return null;
  try {
    mkdirSync(dir, { recursive: true });

    const similar = findSimilarFile(dir, output);
    if (similar) return similar;

    writeFileSync(join(dir, `${toolCallId}.txt`), output, "utf-8");
    writeFileSync(join(dir, `${toolCallId}.sig`), serializeSignature(computeSimilaritySignature(output)));
  } catch { /* best-effort */ }
  return null;
}

export interface AgentStreamOpts {
  run: (messages: AgentMessage[]) => AsyncGenerator<AgentEvent>;
  messages: AgentMessage[];
  signal: AbortSignal;
  onEvent: (event: AgentEvent, pendingTools: Map<string, { name: string; input: unknown }>) => Promise<void>;
  onError: (message: string) => Promise<void>;
}

export function agentStream(opts: AgentStreamOpts) {
  async function execute(messages: AgentMessage[]): Promise<{ reason: TerminalReason; errors: string[] }> {
    try {
      const pendingTools = new Map<string, { name: string; input: unknown }>();
      let hasOutput = false;
      const errors: string[] = [];

      for await (const event of opts.run(messages)) {
        if (opts.signal.aborted) return { reason: "stopped", errors: [] };

        if (event.type === "tool.start") {
          pendingTools.set(event.id, { name: event.name, input: event.input });
        }
        if (event.type === "text.delta" || event.type === "text.done" || event.type === "tool.result") hasOutput = true;
        if (event.type === "error") errors.push((event as any).message ?? "Unknown error");

        await opts.onEvent(event, pendingTools);
      }

      if (!hasOutput && errors.length > 0 && !opts.signal.aborted) {
        return { reason: "error", errors };
      }

      return { reason: opts.signal.aborted ? "stopped" : "done", errors: [] };
    } catch (err) {
      if (opts.signal.aborted) return { reason: "stopped", errors: [] };
      await opts.onError(String(err));
      return { reason: "error", errors: [] };
    }
  }

  return {
    async once(): Promise<TerminalReason> {
      return (await execute(opts.messages)).reason;
    },

    async retry(times: number): Promise<TerminalReason> {
      let messages = opts.messages;
      let overflowed = false;
      for (let attempt = 0; attempt <= times; attempt++) {
        const result = await execute(messages);
        if (result.reason !== "error" || result.errors.length === 0 || opts.signal.aborted) {
          return overflowed && result.reason === "done" ? "overflow" : result.reason;
        }
        if (attempt === times) return overflowed ? "overflow" : result.reason;

        const isRateLimit = result.errors.some((e) => /429|rate.?limit|quota.*reset|exhausted.*capacity/i.test(e));
        if (isRateLimit) return "error";

        const isOverflow = result.errors.some((e) => /prompt is too long|max.*token|context.*length/i.test(e));
        if (isOverflow) {
          overflowed = true;
          messages = dropOldestTurns(messages);
          if (messages.length >= opts.messages.length) return "overflow";
          continue;
        }

        messages = [
          ...opts.messages,
          { role: "assistant", content: `Error: ${result.errors.join("; ")}` },
          { role: "user", content: "The previous attempt failed. Please try again." },
        ];
      }
      return overflowed ? "overflow" : "error";
    },
  };
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
      const summary = def?.summarize?.(event.input, "") || undefined;
      const label = def?.label;
      const icon = def?.icon;
      const friendly = def?.friendlyLabel?.(event.input) || undefined;
      return { kind: "activity", messageId, source: "agent", type: "agent.tool.start", timestamp, data: { id: event.id, name: cleanName, input: event.input, category, summary, label, icon, friendly } };
    }
    case "tool.result": {
      const pending = pendingTools?.get(event.id);
      const toolName = pending ? stripToolPrefix(pending.name) : "";
      const def = tools?.defs.find((d) => d.name === toolName);
      const output = String(event.output);
      const summary = def?.summarize?.(pending?.input, output) ?? fallbackSummary(output);
      const category = def?.category ?? inferCategory(toolName, pending?.input);
      const label = def?.label;
      const icon = def?.icon;
      return { kind: "activity", messageId, source: "agent", type: "agent.tool.result", timestamp, data: { id: event.id, output: event.output, summary, category, label, icon } };
    }
    case "tool.denied":
      return { kind: "activity", messageId, source: "agent", type: "agent.tool.denied", timestamp, data: { id: event.id } };
    case "server_tool.start": {
      const isWebSearch = event.name === "web_search";
      const label = isWebSearch ? "Web Searching" : undefined;
      const icon = isWebSearch ? "globe" : undefined;
      const category = inferCategory(event.name, event.input);
      return { kind: "activity", messageId, source: "agent", type: "agent.tool.start", timestamp, data: { id: event.id, name: event.name, input: event.input, category, label, icon } };
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
