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
        return from(PiSdkToolResultMessagePrototype, { toolCallId: msg.toolCallId, toolName: msg.toolName ?? "", content: [{ type: "text", text: msg.content }] });
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
      const errorMsg = event.error.errorMessage ?? "Unknown error";
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

function steerNoneAborted(turn: AgentTurn, context: Context, log: Logger, beforeHook?: () => void): boolean {
  if (turn.cancellation.aborted) return false;
  const content = turn.steering?.();
  if (!content) return false;
  beforeHook?.();
  log.info("Steer message passed to the agent:", { length: content.length });
  context.messages.push(from(PiSdkUserMessagePrototype, { content }));
  return true;
}

function addToolResultsToContext(context: Context, results: { id: string; name: string; arguments: Record<string, unknown>; output: string }[]): void {
  context.messages.push(from(PiSdkAssistantMessagePrototype, {
    content: results.map((r): ToolCall => ({ type: "toolCall", id: r.id, name: r.name, arguments: r.arguments })),
    stopReason: "toolCall" as AssistantMessage["stopReason"],
  }));
  for (const r of results) {
    context.messages.push(from(PiSdkToolResultMessagePrototype, { toolCallId: r.id, toolName: r.name, content: [{ type: "text", text: r.output }] }));
  }
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
        let pendingCalls: PendingToolCall[] = [];
        let keepGoing = true;

        let round = 0;
        while (keepGoing) {
          keepGoing = false;

          do {
            round++;
            opts.log.info("Tool loop", { round, pending: pendingCalls.length });
            if (turn.cancellation.aborted) break;
            pendingCalls = [];
            const textParts: string[] = [];
            const citationParts: { text: string; label: string }[] = [];

            for await (const piEvent of abortable(streamSimple(opts.model, context, streamOpts), turn.cancellation)) {
              if (turn.cancellation.aborted) break;
              for (const event of mapEvent(piEvent, textParts, opts.onContentBlock)) {
                if (event.type === "tool.pending") {
                  pendingCalls.push(event.call);
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

            if (pendingCalls.length === 0 || !turn.tools) break;

            const results: { id: string; name: string; arguments: Record<string, unknown>; output: string; }[] = [];
            for (const tc of pendingCalls) {
              if (turn.cancellation.aborted) break;

              steerNoneAborted(turn, context, opts.log, () => addToolResultsToContext(context, results.splice(0)));

              const output = await turn.tools!.execute(tc.name, tc.arguments).then((r) => typeof r === "string" ? r : r.text);
              if (turn.cancellation.aborted) break;
              yield { type: "tool.result" as const, id: tc.id, output };
              results.push({ ...tc, output });
            }

            if (turn.cancellation.aborted) break;
            addToolResultsToContext(context, results);
          } while (pendingCalls.length > 0);

          if (steerNoneAborted(turn, context, opts.log)) {
            keepGoing = true;
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
