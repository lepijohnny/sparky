import { readFileSync as readFileSyncFn } from "node:fs";
import type { 
  Model, 
  Api, 
  Context, 
  Tool, 
  AssistantMessageEvent, 
  UserMessage, 
  AssistantMessage, 
  ToolResultMessage, 
  Message, 
  ToolCall, 
  SimpleStreamOptions} from "@mariozechner/pi-ai";
import { streamSimple } from "@mariozechner/pi-ai";
import type { Agent, AgentEvent, AgentTurn, MessageContent } from "../../agent.types";
import { encodeBase64 } from "../adapter.encode64";
import type { Logger } from "../../../logger.types";

const THINKING_LEVELS: Record<number, "minimal" | "low" | "medium" | "high"> = { 1: "minimal", 2: "low", 3: "medium", 4: "high" };

async function* abortable<T>(source: AsyncIterable<T>, signal: AbortSignal): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]();
  const abortPromise = new Promise<never>((_, reject) => {
    if (signal.aborted) { reject(new Error("Aborted")); return; }
    signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true });
  });
  try {
    while (true) {
      const result = await Promise.race([iterator.next(), abortPromise]);
      if (result.done) break;
      yield result.value;
    }
  } finally {
    iterator.return?.();
  }
}

const PiSdkUserMessagePrototype: UserMessage = { role: "user", content: "", timestamp: 0 } as UserMessage;
const PiSdkAssistantMessagePrototype: AssistantMessage = { role: "assistant", content: [], api: "" as Api, provider: "", model: "", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: 0 } as AssistantMessage;
const PiSdkToolResultMessagePrototype: ToolResultMessage = { role: "toolResult", toolCallId: "", toolName: "", content: [], isError: false, timestamp: 0 } as ToolResultMessage;

function from<T extends { timestamp: number }>(proto: T, overrides: Partial<T>): T {
  return { ...proto, ...overrides, timestamp: Date.now() };
}

function mapUserContent(content: MessageContent): string | ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[] {
  if (typeof content === "string") return content;
  const blocks = content.map((part) => {
    if (part.type === "text") return { type: "text" as const, text: part.text };
    if (part.type === "image") return { type: "image" as const, data: encodeBase64(part), mimeType: part.mimeType };
    return { type: "text" as const, text: readFileSyncFn(part.filePath, "utf-8") };
  });
  return blocks.length === 1 && blocks[0].type === "text" ? blocks[0].text : blocks;
}

function mapMessages(messages: AgentTurn["messages"]): Message[] {
  return messages.map((msg): Message => {
    switch (msg.role) {
      case "user":
        return from(PiSdkUserMessagePrototype, { content: mapUserContent(msg.content) });
      case "assistant": {
        const content: ({ type: "text"; text: string } | ToolCall)[] = [{ type: "text", text: msg.content }];
        if (msg.toolCalls) content.push(...msg.toolCalls.map((tc): ToolCall => ({ type: "toolCall", id: tc.id, name: tc.name, arguments: tc.input as Record<string, unknown> })));
        return from(PiSdkAssistantMessagePrototype, { content });
      }
      case "tool":
        return from(PiSdkToolResultMessagePrototype, { toolCallId: msg.toolCallId, toolName: msg.toolName ?? "unknown", content: [{ type: "text", text: msg.content }] });
    }
  });
}

function buildContext(turn: AgentTurn): Context {
  return {
    systemPrompt: turn.system || undefined,
    messages: mapMessages(turn.messages),
    tools: turn.tools?.defs.map((d): Tool => ({ name: d.name, description: d.description, parameters: d.parameters as any })),
  };
}

export type ContentBlockEvent = AgentEvent | { type: "citations"; text: string; label: string };

export type ContentBlockHandler = (block: unknown) => ContentBlockEvent[] | undefined;

export interface PiAgentOptions {
  model: Model<Api>;
  apiKey: string;
  thinkingLevel: number;
  log: Logger;
  onPayload?: (payload: unknown, model: Model<Api>) => unknown | undefined | Promise<unknown | undefined>;
  onContentBlock?: ContentBlockHandler;
  nudgeToolUse?: boolean;
}

export interface PendingToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

type MappedEvent = AgentEvent | { type: "tool.pending"; call: PendingToolCall } | {
  label: string; type: "citations"; text: string 
};

function* mapEvent(event: AssistantMessageEvent, textAccumulator: string[], onContentBlock?: ContentBlockHandler): Generator<MappedEvent> {
  switch (event.type) {
    case "text_delta":    yield { type: "text.delta", content: event.delta }; break;
    case "text_end":      textAccumulator.push(event.content); break;
    case "thinking_start": yield { type: "thinking.start" }; break;
    case "thinking_delta": yield { type: "thinking.delta", content: event.delta }; break;
    case "thinking_end":   yield { type: "thinking.done", content: event.content }; break;
    case "error": {
      const errorMsg = event.error.errorMessage ?? event.error.message ?? JSON.stringify(event.error) ?? "Unknown error";
      if (errorMsg.includes("401") || errorMsg.includes("unauthorized") || errorMsg.includes("authentication")) {
        throw new Error(errorMsg);
      }
      yield { type: "error", message: errorMsg };
      break;
    }
    case "toolcall_end": {
      const block = event.partial.content[event.contentIndex];
      if (block?.type === "toolCall") {
        yield { type: "tool.start", id: block.id, name: block.name, input: block.arguments as Record<string, unknown> ?? {} };
        yield { type: "tool.pending", call: { id: block.id, name: block.name, arguments: block.arguments as Record<string, unknown> ?? {} } };
      }
      break;
    }
    case "content_block": {
      if (onContentBlock) {
        const events = onContentBlock(event.block);
        if (events) for (const e of events) yield e;
      }
      break;
    }
  }
}

export interface LoopState {
  pendingCalls: PendingToolCall[];
  keepGoing: boolean;
  nudged: boolean;
  round: number;
}

export interface FollowUpResult {
  type: string;
}

type FollowUp = (turn: AgentTurn, context: Context, log: Logger, loop: LoopState) => FollowUpResult | null;

export const followUpNudge: FollowUp = (turn, context, log, loop) => {
  if (loop.nudged || loop.round <= 1 || turn.cancellation.aborted) return null;
  log.info("Nudging model to continue after tool results");
  context.messages.push(from(PiSdkUserMessagePrototype, { content: "Continue with the tool results above." }));
  loop.nudged = true;
  loop.keepGoing = true;
  return { type: "nudge" };
};

export const followUpSteer: FollowUp = (turn, context, log, loop) => {
  if (turn.cancellation.aborted) return null;
  const content = turn.steering?.();
  if (!content) return null;
  log.info("Steer message passed to the agent:", { length: content.length });
  context.messages.push(from(PiSdkUserMessagePrototype, { content }));
  loop.keepGoing = true;
  return { type: "steer" };
};

function addToolResultsToContext(context: Context, results: { id: string; name: string; arguments: Record<string, unknown>; output: string }[]): void {
  context.messages.push(from(PiSdkAssistantMessagePrototype, {
    content: results.map((r): ToolCall => ({ type: "toolCall", id: r.id, name: r.name, arguments: r.arguments })),
    stopReason: "toolCall" as AssistantMessage["stopReason"],
  }));
  for (const r of results) {
    context.messages.push(from(PiSdkToolResultMessagePrototype, { toolCallId: r.id, toolName: r.name, content: [{ type: "text", text: r.output }] }));
  }
}

export function buildFollowUps(opts: PiAgentOptions): FollowUp[] {
  const list: FollowUp[] = [];
  if (opts.nudgeToolUse) list.push(followUpNudge);
  list.push(followUpSteer);
  return list;
}

export function createPiAgent(opts: PiAgentOptions): Agent {
  return {
    async *stream(turn: AgentTurn): AsyncGenerator<AgentEvent> {
      const context = buildContext(turn);
      const streamOpts: SimpleStreamOptions = {
        apiKey: opts.apiKey,
        signal: turn.cancellation,
        ...(THINKING_LEVELS[opts.thinkingLevel] ? { reasoning: THINKING_LEVELS[opts.thinkingLevel] } : {}),
        ...(opts.onPayload ? { onPayload: opts.onPayload } : {}),
      };

      try {
        const loop = { pendingCalls: [] as PendingToolCall[], keepGoing: true, nudged: false, round: 0 };
        const followUps = buildFollowUps(opts);

        while (loop.keepGoing) {
          loop.keepGoing = false;

          do {
            loop.round++;
            opts.log.info("Tool loop", { round: loop.round, pending: loop.pendingCalls.length });
            if (turn.cancellation.aborted) break;
            loop.pendingCalls = [];
            const textParts: string[] = [];
            const citationParts: { text: string; label: string }[] = [];

            for await (const piEvent of abortable(streamSimple(opts.model, context, streamOpts), turn.cancellation)) {
              if (turn.cancellation.aborted) break;
              for (const event of mapEvent(piEvent, textParts, opts.onContentBlock)) {
                if (event.type === "tool.pending") {
                  loop.pendingCalls.push(event.call);
                } else if (event.type === "citations") {
                  citationParts.push({ text: event.text, label: event.label ?? "Citations" });
                } else {
                  yield event;
                }
              }
            }

            if ((textParts.length > 0 || citationParts.length > 0) && !turn.cancellation.aborted) {
              const label = citationParts[0]?.label ?? "Citations";
              const uniqueCitations = [...new Set(citationParts.flatMap((c) => c.text.split("\n")))].join("\n");
              const sources = uniqueCitations ? `\n\n---\n**${label}:**\n` + uniqueCitations : "";
              yield { type: "text.done", content: textParts.join("") + sources };
            }

            if (loop.pendingCalls.length === 0 || !turn.tools) break;

            const results: { id: string; name: string; arguments: Record<string, unknown>; output: string; }[] = [];
            for (const tc of loop.pendingCalls) {
              if (turn.cancellation.aborted) break;

              if (!turn.cancellation.aborted) {
                const steerContent = turn.steering?.();
                if (steerContent) {
                  addToolResultsToContext(context, results.splice(0));
                  opts.log.info("Steer message passed to the agent:", { length: steerContent.length });
                  context.messages.push(from(PiSdkUserMessagePrototype, { content: steerContent }));
                }
              }

              const output = await turn.tools!.execute(tc.name, tc.arguments).then((r) => typeof r === "string" ? r : r.text);
              if (turn.cancellation.aborted) break;
              yield { type: "tool.result" as const, id: tc.id, output };
              results.push({ ...tc, output });
            }

            if (turn.cancellation.aborted) break;
            addToolResultsToContext(context, results);
            loop.nudged = false;

          } while (loop.pendingCalls.length > 0);

          for (const followUp of followUps) {
            const result = followUp(turn, context, opts.log, loop);
            if (result) { yield { type: "followup", followUpType: result.type }; break; }
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (turn.cancellation.aborted) {
          /* intentional abort */
        } else if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("authentication")) {
          throw err;
        } else {
          opts.log.error("pi-ai stream error", { error: msg });
          yield { type: "error", message: msg };
        }
      }

      yield { type: "done" };
    },
  };
}
