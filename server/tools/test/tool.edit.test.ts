import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { edit } from "../tool.edit";
import type { ToolContext } from "../tool.registry";
import { createEventBus } from "../../core/bus";
import { noopLogger } from "../../logger";

const TMP = join(import.meta.dirname, ".tmp-edit-test");

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

function writeTmp(name: string, content: string): string {
  const p = join(TMP, name);
  writeFileSync(p, content);
  return p;
}

describe("app_edit", () => {
  const ctx = makeCtx();

  beforeAll(() => mkdirSync(TMP, { recursive: true }));
  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  test("given file with matching text, when editing, then replaces text", async () => {
    const p = writeTmp("simple.txt", "hello world");
    const result = await edit.execute({ path: p, oldText: "world", newText: "mars" }, ctx);
    expect(result).toContain("Edited");
    expect(readFileSync(p, "utf-8")).toBe("hello mars");
  });

  test("given file with multiline match, when editing, then replaces correctly", async () => {
    const p = writeTmp("multi.txt", "line1\nline2\nline3");
    const result = await edit.execute({ path: p, oldText: "line1\nline2", newText: "replaced" }, ctx);
    expect(result).toContain("replaced 2 lines with 1 lines");
    expect(readFileSync(p, "utf-8")).toBe("replaced\nline3");
  });

  test("given file without matching text, when editing, then returns error with hint", async () => {
    const p = writeTmp("nomatch.txt", "hello world\nfoo bar\nbaz qux");
    const result = await edit.execute({ path: p, oldText: "missing foo", newText: "nope" }, ctx);
    expect(result).toContain("Error: oldText not found");
    expect(result).toContain("Closest match near line");
    expect(result).toContain("app_read");
  });

  test("given file with duplicate matches, when editing, then returns error", async () => {
    const p = writeTmp("dup.txt", "foo bar foo");
    const result = await edit.execute({ path: p, oldText: "foo", newText: "baz" }, ctx);
    expect(result).toContain("Error: oldText matches multiple locations");
  });

  test("given nonexistent file, when editing, then returns error", async () => {
    const result = await edit.execute({ path: join(TMP, "nope.txt"), oldText: "x", newText: "y" }, ctx);
    expect(result).toContain("Error: file not found");
  });

  test("given directory path, when editing, then returns error", async () => {
    const result = await edit.execute({ path: TMP, oldText: "x", newText: "y" }, ctx);
    expect(result).toContain("Error: not a file");
  });

  test("given empty newText, when editing, then deletes the matched text", async () => {
    const p = writeTmp("delete.txt", "aaa\nbbb\nccc");
    const result = await edit.execute({ path: p, oldText: "\nbbb", newText: "" }, ctx);
    expect(result).toContain("Edited");
    expect(readFileSync(p, "utf-8")).toBe("aaa\nccc");
  });

  test("given whitespace-sensitive match, when editing, then preserves exact match", async () => {
    const p = writeTmp("ws.txt", "  indented\n    deep");
    const result = await edit.execute({ path: p, oldText: "  indented", newText: "flat" }, ctx);
    expect(readFileSync(p, "utf-8")).toBe("flat\n    deep");
  });
});
