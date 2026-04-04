import { describe, test, expect, vi } from "vitest";
import { followUpNudge, followUpSteer, buildFollowUps, type LoopState } from "../adapters/pi/pi.agent";
import type { AgentTurn } from "../agent.types";
import type { Context } from "@mariozechner/pi-ai";
import type { Logger } from "../../logger.types";
import { StreamBufferManager } from "../../chat/chat.db.buffer";
import type { ChatEntry } from "../../chat/chat.types";

function makeLoop(overrides?: Partial<LoopState>): LoopState {
  return { pendingCalls: [], keepGoing: false, nudged: false, round: 2, ...overrides };
}

function makeTurn(overrides?: Partial<AgentTurn>): AgentTurn {
  return {
    system: "",
    messages: [],
    cancellation: new AbortController().signal,
    ...overrides,
  } as AgentTurn;
}

function makeContext(): Context {
  return { messages: [] } as unknown as Context;
}

const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as Logger;

describe("tryNudge", () => {
  test("given round > 1 and not nudged, when called, then injects message and sets keepGoing", () => {
    const loop = makeLoop();
    const ctx = makeContext();
    const result = followUpNudge(makeTurn(), ctx, log, loop);
    expect(result).toEqual({ type: "nudge" });
    expect(loop.keepGoing).toBe(true);
    expect(loop.nudged).toBe(true);
    expect(ctx.messages).toHaveLength(1);
  });

  test("given already nudged, when called, then returns null", () => {
    const loop = makeLoop({ nudged: true });
    const ctx = makeContext();
    const result = followUpNudge(makeTurn(), ctx, log, loop);
    expect(result).toBeNull();
    expect(loop.keepGoing).toBe(false);
    expect(ctx.messages).toHaveLength(0);
  });

  test("given round 1, when called, then returns null", () => {
    const loop = makeLoop({ round: 1 });
    const ctx = makeContext();
    const result = followUpNudge(makeTurn(), ctx, log, loop);
    expect(result).toBeNull();
  });

  test("given aborted, when called, then returns null", () => {
    const ac = new AbortController();
    ac.abort();
    const loop = makeLoop();
    const result = followUpNudge(makeTurn({ cancellation: ac.signal }), makeContext(), log, loop);
    expect(result).toBeNull();
  });
});

describe("trySteer", () => {
  test("given steering returns content, when called, then injects message and sets keepGoing", () => {
    const loop = makeLoop();
    const ctx = makeContext();
    const turn = makeTurn({ steering: () => "do more" });
    const result = followUpSteer(turn, ctx, log, loop);
    expect(result).toEqual({ type: "steer" });
    expect(loop.keepGoing).toBe(true);
    expect(ctx.messages).toHaveLength(1);
  });

  test("given no steering, when called, then returns null", () => {
    const loop = makeLoop();
    const ctx = makeContext();
    const result = followUpSteer(makeTurn(), ctx, log, loop);
    expect(result).toBeNull();
    expect(loop.keepGoing).toBe(false);
  });

  test("given steering returns empty, when called, then returns null", () => {
    const loop = makeLoop();
    const result = followUpSteer(makeTurn({ steering: () => "" }), makeContext(), log, loop);
    expect(result).toBeNull();
  });

  test("given aborted, when called, then returns null", () => {
    const ac = new AbortController();
    ac.abort();
    const loop = makeLoop();
    const result = followUpSteer(makeTurn({ cancellation: ac.signal, steering: () => "steer" }), makeContext(), log, loop);
    expect(result).toBeNull();
  });
});

describe("buildFollowUps", () => {
  test("given nudgeToolUse enabled, when built, then includes tryNudge before trySteer", () => {
    const list = buildFollowUps({ nudgeToolUse: true } as any);
    expect(list).toHaveLength(2);
    expect(list[0]).toBe(followUpNudge);
    expect(list[1]).toBe(followUpSteer);
  });

  test("given nudgeToolUse disabled, when built, then only includes trySteer", () => {
    const list = buildFollowUps({} as any);
    expect(list).toHaveLength(1);
    expect(list[0]).toBe(followUpSteer);
  });
});

describe("followUp priority", () => {
  test("given both nudge and steer possible, when iterated, then nudge wins", () => {
    const loop = makeLoop();
    const ctx = makeContext();
    const turn = makeTurn({ steering: () => "steer content" });
    const followUps = buildFollowUps({ nudgeToolUse: true } as any);

    let fired: { type: string } | null = null;
    for (const followUp of followUps) {
      const result = followUp(turn, ctx, log, loop);
      if (result) { fired = result; break; }
    }

    expect(fired).toEqual({ type: "nudge" });
    expect(loop.nudged).toBe(true);
    expect(loop.keepGoing).toBe(true);
    expect(ctx.messages).toHaveLength(1);
    expect((ctx.messages[0] as any).content).toBe("Continue with the tool results above.");
  });

  test("given nudge already used, when iterated, then steer fires", () => {
    const loop = makeLoop({ nudged: true });
    const ctx = makeContext();
    const turn = makeTurn({ steering: () => "steer content" });
    const followUps = buildFollowUps({ nudgeToolUse: true } as any);

    let fired: { type: string } | null = null;
    for (const followUp of followUps) {
      const result = followUp(turn, ctx, log, loop);
      if (result) { fired = result; break; }
    }

    expect(fired).toEqual({ type: "steer" });
    expect(ctx.messages).toHaveLength(1);
    expect((ctx.messages[0] as any).content).toBe("steer content");
  });
});

describe("nudge persistence", () => {
  test("given agent.followup.nudge activity, when checking shouldPersist, then returns true", () => {
    const entry: ChatEntry = { kind: "activity", messageId: "t1", source: "agent", type: "agent.followup.nudge", timestamp: "t" };
    expect(StreamBufferManager.shouldPersist(entry)).toBe(true);
  });

  test("given agent.followup.steer activity, when checking shouldPersist, then returns false", () => {
    const entry: ChatEntry = { kind: "activity", messageId: "t1", source: "agent", type: "agent.followup.steer", timestamp: "t" };
    expect(StreamBufferManager.shouldPersist(entry)).toBe(false);
  });
});

describe("nudge resets after tool execution", () => {
  test("given nudged is true, when tools execute and reset it, then nudge can fire again", () => {
    const loop = makeLoop({ nudged: true });
    expect(followUpNudge(makeTurn(), makeContext(), log, loop)).toBeNull();

    loop.nudged = false;
    loop.round = 3;
    const ctx = makeContext();
    const result = followUpNudge(makeTurn(), ctx, log, loop);
    expect(result).toEqual({ type: "nudge" });
    expect(ctx.messages).toHaveLength(1);
  });
});

describe("followUp result types", () => {
  test("given nudge fires, when checking result, then type is nudge", () => {
    const result = followUpNudge(makeTurn(), makeContext(), log, makeLoop());
    expect(result?.type).toBe("nudge");
  });

  test("given steer fires, when checking result, then type is steer", () => {
    const result = followUpSteer(makeTurn({ steering: () => "go" }), makeContext(), log, makeLoop());
    expect(result?.type).toBe("steer");
  });
});
