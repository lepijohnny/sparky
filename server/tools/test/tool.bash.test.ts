import { describe, test, expect } from "vitest";
import { bash } from "../tool.bash";
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

describe("app_bash", () => {
  const ctx = makeCtx();

  test("given simple command, when executing, then returns stdout", async () => {
    const result = await bash.execute({ command: "echo hello" }, ctx);
    expect(result).toBe("hello");
  });

  test("given command with stderr, when failing, then returns exit code and stderr", async () => {
    const result = await bash.execute({ command: "ls /nonexistent_path_xyz 2>&1 || true" }, ctx);
    expect(result).toContain("No such file or directory");
  });

  test("given command with no output, when executing, then returns no output marker", async () => {
    const result = await bash.execute({ command: "true" }, ctx);
    expect(result).toBe("(no output)");
  });

  test("given command with exit code, when failing, then returns exit code", async () => {
    const result = await bash.execute({ command: "exit 42" }, ctx);
    expect(result).toContain("Exit code 42");
  });

  test("given multiline output, when executing, then returns all lines", async () => {
    const result = await bash.execute({ command: "echo 'a\nb\nc'" }, ctx);
    expect(result).toBe("a\nb\nc");
  });

  test("given timeout, when command exceeds it, then returns timeout error", async () => {
    const result = await bash.execute({ command: "sleep 10", timeout: 1 }, ctx);
    expect(result).toContain("timed out");
  });

  test("given pipe command, when executing, then returns piped output", async () => {
    const result = await bash.execute({ command: "echo 'hello world' | tr ' ' '\\n'" }, ctx);
    expect(result).toBe("hello\nworld");
  });

  test("given summarize, when called, then returns truncated command", () => {
    expect(bash.summarize!({ command: "echo hi" }, "")).toBe("$ echo hi");
    const long = "x".repeat(100);
    expect(bash.summarize!({ command: long }, "").length).toBeLessThan(65);
  });
});
