import { describe, test, expect } from "vitest";
import { stripToolPrefix, inferCategory, fallbackSummary, agentStream } from "../chat.conversation.loop";
import type { AgentEvent } from "../../core/agent.types";

describe("stripToolPrefix", () => {
  test("given mcp prefixed name, when stripping, then prefix is removed", () => {
    expect(stripToolPrefix("mcp__server__tool_name")).toBe("tool_name");
  });

  test("given unprefixed name, when stripping, then unchanged", () => {
    expect(stripToolPrefix("search")).toBe("search");
  });

  test("given double underscore in tool name, when stripping, then only prefix removed", () => {
    expect(stripToolPrefix("mcp__srv__my__tool")).toBe("my__tool");
  });
});

describe("inferCategory", () => {
  test("given bus_emit with settings.labels event, when inferring, then returns label", () => {
    expect(inferCategory("app_bus_emit", { event: "settings.labels.create" })).toBe("label");
  });

  test("given bus_emit with chat.label event, when inferring, then returns label", () => {
    expect(inferCategory("app_bus_emit", { event: "chat.label.add" })).toBe("label");
  });

  test("given bus_emit with settings.llm event, when inferring, then returns connection", () => {
    expect(inferCategory("app_bus_emit", { event: "settings.llm.update" })).toBe("connection");
  });

  test("given bus_emit with chat event, when inferring, then returns chat", () => {
    expect(inferCategory("app_bus_emit", { event: "chat.rename" })).toBe("chat");
  });

  test("given non bus_emit tool, when inferring, then returns system", () => {
    expect(inferCategory("search", {})).toBe("system");
  });

  test("given bus_emit with unknown event, when inferring, then returns system", () => {
    expect(inferCategory("app_bus_emit", { event: "unknown.thing" })).toBe("system");
  });
});

describe("fallbackSummary", () => {
  test("given JSON with ok:true, when summarizing, then returns Done", () => {
    expect(fallbackSummary('{"ok":true}')).toBe("Done");
  });

  test("given JSON with array, when summarizing, then returns count", () => {
    expect(fallbackSummary('{"items":[1,2,3]}')).toBe("3 items");
  });

  test("given JSON with name, when summarizing, then returns quoted name", () => {
    expect(fallbackSummary('{"name":"My Chat"}')).toBe('"My Chat"');
  });

  test("given long string, when summarizing, then truncates at 48 chars", () => {
    const long = "A".repeat(100);
    const result = fallbackSummary(long);
    expect(result.length).toBeLessThanOrEqual(49);
    expect(result).toContain("…");
  });

  test("given short string, when summarizing, then returns as-is", () => {
    expect(fallbackSummary("hello")).toBe("hello");
  });
});

function mockStream(events: AgentEvent[]): () => AsyncGenerator<AgentEvent> {
  return function* () {
    for (const e of events) yield e;
  } as unknown as () => AsyncGenerator<AgentEvent>;
}

function mockStreamSequence(rounds: AgentEvent[][]): (msgs: unknown[]) => AsyncGenerator<AgentEvent> {
  let call = 0;
  return function* () {
    const events = rounds[Math.min(call++, rounds.length - 1)];
    for (const e of events) yield e;
  } as unknown as (msgs: unknown[]) => AsyncGenerator<AgentEvent>;
}

function baseOpts(run: (msgs: unknown[]) => AsyncGenerator<AgentEvent>) {
  const emitted: AgentEvent[] = [];
  const errors: string[] = [];
  return {
    opts: {
      run: run as any,
      messages: [{ role: "user" as const, content: "hello" }],
      signal: new AbortController().signal,
      onEvent: async (event: AgentEvent) => { emitted.push(event); },
      onError: async (msg: string) => { errors.push(msg); },
    },
    emitted,
    errors,
  };
}

describe("agentStream.retryIf", () => {
  test("given 401 error with no output, when retryIf matches 401, then retries and succeeds", async () => {
    const run = mockStreamSequence([
      [
        { type: "error", message: "401 Unauthorized" } as AgentEvent,
        { type: "done" } as AgentEvent,
      ],
      [
        { type: "text.delta", content: "Hello" } as AgentEvent,
        { type: "text.done", content: "Hello" } as AgentEvent,
        { type: "done" } as AgentEvent,
      ],
    ]);
    const { opts, emitted } = baseOpts(run);

    const result = await agentStream(opts).retryIf((errs) => errs.some((e) => e.includes("401")));

    expect(result).toBe("done");
    expect(emitted.some((e) => e.type === "text.done")).toBe(true);
  });

  test("given 401 error with no output, when retryIf does not match, then returns error without retry", async () => {
    const run = mockStreamSequence([
      [
        { type: "error", message: "401 Unauthorized" } as AgentEvent,
        { type: "done" } as AgentEvent,
      ],
      [
        { type: "text.done", content: "Should not reach" } as AgentEvent,
        { type: "done" } as AgentEvent,
      ],
    ]);
    const { opts, emitted } = baseOpts(run);

    const result = await agentStream(opts).retryIf((errs) => errs.some((e) => e.includes("500")));

    expect(result).toBe("error");
    expect(emitted.some((e) => e.type === "text.done")).toBe(false);
  });

  test("given invalid_type error, when retryIf matches, then retries once", async () => {
    const run = mockStreamSequence([
      [
        { type: "error", message: 'invalid_type: expected string, received undefined' } as AgentEvent,
        { type: "done" } as AgentEvent,
      ],
      [
        { type: "text.delta", content: "Fixed" } as AgentEvent,
        { type: "text.done", content: "Fixed" } as AgentEvent,
        { type: "done" } as AgentEvent,
      ],
    ]);
    const { opts } = baseOpts(run);

    const result = await agentStream(opts).retryIf((errs) => errs.some((e) => e.includes("invalid_type")));

    expect(result).toBe("done");
  });

  test("given error with text output, when retryIf matches, then does not retry", async () => {
    const run = mockStream([
      { type: "text.delta", content: "Partial..." } as AgentEvent,
      { type: "error", message: "401 Unauthorized" } as AgentEvent,
      { type: "done" } as AgentEvent,
    ]);
    const { opts, emitted } = baseOpts(run as any);

    const result = await agentStream(opts).retryIf((errs) => errs.some((e) => e.includes("401")));

    expect(result).toBe("done");
    expect(emitted.some((e) => e.type === "text.delta")).toBe(true);
  });

  test("given 401 error on both attempts, when retryIf matches, then returns error after one retry", async () => {
    const run = mockStreamSequence([
      [
        { type: "error", message: "401 Unauthorized" } as AgentEvent,
        { type: "done" } as AgentEvent,
      ],
      [
        { type: "error", message: "401 Unauthorized again" } as AgentEvent,
        { type: "done" } as AgentEvent,
      ],
    ]);
    const { opts } = baseOpts(run);

    const result = await agentStream(opts).retryIf((errs) => errs.some((e) => e.includes("401")));

    expect(result).toBe("error");
  });

  test("given successful stream, when retryIf configured, then returns done without retry", async () => {
    const run = mockStream([
      { type: "text.delta", content: "All good" } as AgentEvent,
      { type: "text.done", content: "All good" } as AgentEvent,
      { type: "done" } as AgentEvent,
    ]);
    const { opts } = baseOpts(run as any);

    const result = await agentStream(opts).retryIf(() => true);

    expect(result).toBe("done");
  });
});

describe("agentStream.once", () => {
  test("given error stream, when once, then returns error without retry", async () => {
    const run = mockStream([
      { type: "error", message: "401 Unauthorized" } as AgentEvent,
      { type: "done" } as AgentEvent,
    ]);
    const { opts } = baseOpts(run as any);

    const result = await agentStream(opts).once();

    expect(result).toBe("error");
  });
});
