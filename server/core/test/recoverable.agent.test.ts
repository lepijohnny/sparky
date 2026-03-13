import { describe, expect, test } from "vitest";
import type { Agent, AgentEvent, AgentTurn } from "../agent.types";
import { RecoverableAgent, type RecoveryAction } from "../adapters/agent.recoverable";

const noop = { info() {}, warn() {}, error() {}, debug() {} } as any;

function makeTurn(content = "hello"): AgentTurn {
  return {
    system: "You are helpful",
    messages: [{ role: "user", content }],
    cancellation: new AbortController().signal,
  };
}

function makeAgent(events: AgentEvent[]): Agent {
  return {
    async *stream() {
      for (const e of events) yield e;
    },
  };
}

function makeThrowingAgent(error: string): Agent {
  return {
    async *stream() {
      throw new Error(error);
    },
  };
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const e of gen) events.push(e);
  return events;
}

describe("RecoverableAgent", () => {
  test("given successful inner agent, when streaming, then passes through all events", async () => {
    const inner = makeAgent([
      { type: "text.delta", content: "Hi" },
      { type: "text.done", content: "Hi" },
      { type: "done" },
    ]);

    const agent = new RecoverableAgent(inner, [], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("text.delta");
    expect(events[2].type).toBe("done");
  });

  test("given non-recoverable error, when streaming, then yields error and done", async () => {
    const inner = makeThrowingAgent("network timeout");
    const agent = new RecoverableAgent(inner, [], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("error");
    expect((events[0] as any).message).toContain("network timeout");
    expect(events[1].type).toBe("done");
  });

  test("given matching recovery action, when error occurs, then retries with recovered agent", async () => {
    const inner = makeThrowingAgent("401 unauthorized");
    const recovered = makeAgent([
      { type: "text.delta", content: "Recovered!" },
      { type: "text.done", content: "Recovered!" },
      { type: "done" },
    ]);

    const action: RecoveryAction = {
      match: (err) => err.includes("401"),
      recover: async () => recovered,
    };

    const agent = new RecoverableAgent(inner, [action], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("text.delta");
    expect((events[0] as any).content).toBe("Recovered!");
  });

  test("given recovery that throws, when error occurs, then yields recovery error", async () => {
    const inner = makeThrowingAgent("401 unauthorized");

    const action: RecoveryAction = {
      match: (err) => err.includes("401"),
      recover: async () => { throw new Error("refresh token expired"); },
    };

    const agent = new RecoverableAgent(inner, [action], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("error");
    expect((events[0] as any).message).toContain("refresh token expired");
    expect(events[1].type).toBe("done");
  });

  test("given recovered agent that also fails, when retrying, then yields second error", async () => {
    const inner = makeThrowingAgent("401 unauthorized");
    const alsoFails = makeThrowingAgent("still broken");

    const action: RecoveryAction = {
      match: (err) => err.includes("401"),
      recover: async () => alsoFails,
    };

    const agent = new RecoverableAgent(inner, [action], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("error");
    expect((events[0] as any).message).toContain("still broken");
  });

  test("given multiple actions, when error matches first, then uses first action", async () => {
    const inner = makeThrowingAgent("authentication_failed 401");
    let usedAction = "";

    const actions: RecoveryAction[] = [
      {
        match: (err) => err.includes("401"),
        recover: async () => { usedAction = "first"; return makeAgent([{ type: "done" }]); },
      },
      {
        match: (err) => err.includes("authentication"),
        recover: async () => { usedAction = "second"; return makeAgent([{ type: "done" }]); },
      },
    ];

    const agent = new RecoverableAgent(inner, actions, noop);
    await collect(agent.stream(makeTurn()));

    expect(usedAction).toBe("first");
  });

  test("given no matching action, when error occurs, then skips recovery", async () => {
    const inner = makeThrowingAgent("connection refused");
    let recovered = false;

    const action: RecoveryAction = {
      match: (err) => err.includes("401"),
      recover: async () => { recovered = true; return makeAgent([{ type: "done" }]); },
    };

    const agent = new RecoverableAgent(inner, [action], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(recovered).toBe(false);
    expect(events[0].type).toBe("error");
  });

  test("given successful recovery, when streaming again, then uses recovered agent", async () => {
    const inner = makeThrowingAgent("401");
    const recovered = makeAgent([{ type: "done" }]);

    const action: RecoveryAction = {
      match: (err) => err.includes("401"),
      recover: async () => recovered,
    };

    const agent = new RecoverableAgent(inner, [action], noop);
    await collect(agent.stream(makeTurn()));

    const events = await collect(agent.stream(makeTurn()));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
  });

  test("given authentication_failed error yielded as event, when agent re-throws it, then recovery kicks in", async () => {
    const inner: Agent = {
      async *stream() {
        throw new Error("Claude error: authentication_failed");
      },
    };

    const recovered = makeAgent([
      { type: "text.delta", content: "Refreshed!" },
      { type: "done" },
    ]);

    const action: RecoveryAction = {
      match: (err) => err.includes("authentication"),
      recover: async () => recovered,
    };

    const agent = new RecoverableAgent(inner, [action], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("text.delta");
    expect((events[0] as any).content).toBe("Refreshed!");
    expect(events[1].type).toBe("done");
  });

  test("given authentication_failed error not re-thrown, when yielded as event, then no recovery happens", async () => {
    const inner = makeAgent([
      { type: "error", message: "Claude error: authentication_failed" },
      { type: "done" },
    ]);

    let recovered = false;
    const action: RecoveryAction = {
      match: (err) => err.includes("authentication"),
      recover: async () => { recovered = true; return makeAgent([{ type: "done" }]); },
    };

    const agent = new RecoverableAgent(inner, [action], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(recovered).toBe(false);
    expect(events[0].type).toBe("error");
    expect(events[1].type).toBe("done");
  });

  test("given raw string throw, when streaming, then yields error with string content", async () => {
    const inner: Agent = {
      async *stream() {
        throw "raw string error";
      },
    };

    const agent = new RecoverableAgent(inner, [], noop);
    const events = await collect(agent.stream(makeTurn()));

    expect(events[0].type).toBe("error");
    expect((events[0] as any).message).toContain("raw string error");
  });
});
