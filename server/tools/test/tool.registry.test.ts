import { describe, test, expect, vi } from "vitest";
import { z } from "zod/v4";
import { defineTool, createToolSet } from "../tool.registry";
import type { ToolContext } from "../tool.registry";
import { createEventBus } from "../../core/bus";
import { ToolApproval } from "../../core/tool.approval";
import { noopLogger } from "../../logger";

function makeCtx(signal?: AbortSignal): ToolContext {
  const bus = createEventBus(noopLogger);
  const approval = new ToolApproval(bus, noopLogger);
  return {
    bus,
    log: noopLogger,
    role: "sparky",
    signal: signal ?? new AbortController().signal,
    approval,
    approvalCtx: { chatId: "c1", turnId: "t1" },
  };
}

const echoTool = defineTool({
  name: "echo",
  description: "Echoes input",
  schema: z.object({ text: z.string() }),
  async execute(input) { return input.text; },
});

const slowTool = defineTool({
  name: "slow",
  description: "Slow tool",
  schema: z.object({}),
  async execute(_input, ctx) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (ctx.signal.aborted) throw new Error("aborted");
    return "done";
  },
});

const failTool = defineTool({
  name: "fail",
  description: "Always fails",
  schema: z.object({}),
  recovery: "Try something else",
  async execute() { throw new Error("boom"); },
});

describe("createToolSet", () => {
  test("given valid input, when execute called, then returns tool output", async () => {
    const ctx = makeCtx();
    const set = createToolSet([echoTool], ctx);
    const result = await set.execute("echo", { text: "hello" });
    expect(result).toBe("hello");
  });

  test("given unknown tool name, when execute called, then returns error with available tools", async () => {
    const ctx = makeCtx();
    const set = createToolSet([echoTool], ctx);
    const result = await set.execute("unknown", {});
    expect(result).toContain("unknown tool");
    expect(result).toContain("echo");
  });

  test("given invalid input, when execute called, then returns validation error", async () => {
    const ctx = makeCtx();
    const set = createToolSet([echoTool], ctx);
    const result = await set.execute("echo", { text: 123 });
    expect(result).toContain("Try again");
  });

  test("given aborted signal, when execute called, then returns cancelled immediately", async () => {
    const controller = new AbortController();
    controller.abort();
    const ctx = makeCtx(controller.signal);
    const set = createToolSet([echoTool], ctx);
    const executeSpy = vi.spyOn(echoTool, "execute");
    const result = await set.execute("echo", { text: "hello" });
    expect(result).toBe("Error: cancelled");
    expect(executeSpy).not.toHaveBeenCalled();
  });

  test("given signal aborted during execution, when tool checks signal, then throws and returns error", async () => {
    const controller = new AbortController();
    const ctx = makeCtx(controller.signal);
    const set = createToolSet([slowTool], ctx);
    setTimeout(() => controller.abort(), 20);
    const result = await set.execute("slow", {});
    expect(result).toContain("Error");
    expect(result).toContain("aborted");
  });

  test("given tool with recovery hint, when execution fails, then error includes recovery", async () => {
    const ctx = makeCtx();
    const set = createToolSet([failTool], ctx);
    const result = await set.execute("fail", {});
    expect(result).toContain("boom");
    expect(result).toContain("Try something else");
  });

  test("given tool with recovery hint, when validation fails, then error includes recovery", async () => {
    const strict = defineTool({
      name: "strict",
      description: "Needs a name",
      schema: z.object({ name: z.string() }),
      recovery: "Provide a name string",
      async execute() { return "ok"; },
    });
    const ctx = makeCtx();
    const set = createToolSet([strict], ctx);
    const result = await set.execute("strict", {});
    expect(result).toContain("Try again");
    expect(result).toContain("Provide a name string");
  });

  test("given multiple tools, when defs accessed, then all tools listed with JSON schemas", () => {
    const ctx = makeCtx();
    const set = createToolSet([echoTool, slowTool, failTool], ctx);
    expect(set.defs).toHaveLength(3);
    expect(set.defs.map((d) => d.name)).toEqual(["echo", "slow", "fail"]);
    expect(set.defs[0].parameters).toBeDefined();
  });
});
