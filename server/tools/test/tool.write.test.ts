import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { write } from "../tool.write";
import type { ToolContext } from "../tool.registry";
import { createEventBus } from "../../core/bus";
import { noopLogger } from "../../logger";

const TMP = join(import.meta.dirname, ".tmp-write-test");

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

describe("app_write", () => {
  const ctx = makeCtx();

  beforeAll(() => mkdirSync(TMP, { recursive: true }));
  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  test("given new file, when writing, then creates file with content", async () => {
    const p = join(TMP, "new.txt");
    const result = await write.execute({ path: p, content: "hello\nworld" }, ctx);
    expect(result).toContain("Wrote 2 lines");
    expect(readFileSync(p, "utf-8")).toBe("hello\nworld");
  });

  test("given existing file, when writing, then overwrites content", async () => {
    const p = join(TMP, "overwrite.txt");
    await write.execute({ path: p, content: "first" }, ctx);
    await write.execute({ path: p, content: "second" }, ctx);
    expect(readFileSync(p, "utf-8")).toBe("second");
  });

  test("given nested path, when writing, then creates parent directories", async () => {
    const p = join(TMP, "a", "b", "c", "deep.txt");
    const result = await write.execute({ path: p, content: "deep" }, ctx);
    expect(result).toContain("Wrote");
    expect(readFileSync(p, "utf-8")).toBe("deep");
  });

  test("given directory path, when writing, then returns error", async () => {
    const dir = join(TMP, "adir");
    mkdirSync(dir, { recursive: true });
    const result = await write.execute({ path: dir, content: "nope" }, ctx);
    expect(result).toContain("Error: path is a directory");
  });

  test("given empty content, when writing, then returns error", async () => {
    const p = join(TMP, "empty.txt");
    const result = await write.execute({ path: p, content: "" }, ctx);
    expect(result).toContain("must not be empty");
  });

  test("given whitespace-only content, when writing, then returns error", async () => {
    const p = join(TMP, "ws.txt");
    const result = await write.execute({ path: p, content: "   \n  " }, ctx);
    expect(result).toContain("must not be empty");
  });
});
