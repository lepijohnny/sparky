import { describe, test, expect } from "vitest";
import { busEmit } from "../tool.bus.emit";
import type { ToolContext } from "../tool.registry";
import { createEventBus } from "../../core/bus";
import { noopLogger } from "../../logger";

const mockTrust = { init: async () => {}, data: () => ({} as any), setMode: () => {}, addRule: () => {}, removeRule: () => {}, resolve: () => ({ decision: "allow" as const }), reset: () => {}, clear: () => {} };
const mockApprovalCtx = { chatId: "c1", turnId: "t1", requestApproval: async () => true };

function makeCtx(): ToolContext {
  const bus = createEventBus(noopLogger);
  return {
    bus,
    log: noopLogger,
    role: "sparky",
    signal: new AbortController().signal,
    approvalCtx: mockApprovalCtx,
    trust: mockTrust,
  };
}

describe("app_bus_emit", () => {
  test("given unknown event, when emitting, then returns error with event name", async () => {
    const ctx = makeCtx();
    const result = await busEmit.execute({ event: "chat.message.send", params: { chatId: "c1", text: "Hi" } }, ctx);
    expect(result).toContain("Error: unknown event");
    expect(result).toContain("chat.message.send");
  });

  test("given app_ prefixed event, when emitting, then returns error directing to call tool directly", async () => {
    const ctx = makeCtx();
    const result = await busEmit.execute({ event: "app_write", params: {} }, ctx);
    expect(result).toContain("is a tool, not a bus event");
  });

  test("given known event with listener, when emitting, then returns result", async () => {
    const ctx = makeCtx();
    ctx.bus.on("chat.list" as any, () => ({ chats: [] }));
    const result = await busEmit.execute({ event: "chat.list" }, ctx);
    expect(JSON.parse(result)).toEqual({ chats: [] });
  });
});
