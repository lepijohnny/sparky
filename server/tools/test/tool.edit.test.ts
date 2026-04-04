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
    const result = await edit.execute({ path: p, edits: [{ oldText: "world", newText: "mars" }] }, ctx);
    expect(result).toContain("Edited");
    expect(readFileSync(p, "utf-8")).toBe("hello mars");
  });

  test("given file with multiline match, when editing, then replaces correctly", async () => {
    const p = writeTmp("multi.txt", "line1\nline2\nline3");
    const result = await edit.execute({ path: p, edits: [{ oldText: "line1\nline2", newText: "replaced" }] }, ctx);
    expect(result).toContain("replaced 2 lines with 1 lines");
    expect(readFileSync(p, "utf-8")).toBe("replaced\nline3");
  });

  test("given file without matching text, when editing, then returns error with hint", async () => {
    const p = writeTmp("nomatch.txt", "hello world\nfoo bar\nbaz qux");
    const result = await edit.execute({ path: p, edits: [{ oldText: "missing foo", newText: "nope" }] }, ctx);
    expect(result).toContain("oldText not found");
    expect(result).toContain("Closest match near line");
    expect(result).toContain("app_read");
  });

  test("given file with duplicate matches, when editing, then returns error", async () => {
    const p = writeTmp("dup.txt", "foo bar foo");
    const result = await edit.execute({ path: p, edits: [{ oldText: "foo", newText: "baz" }] }, ctx);
    expect(result).toContain("oldText matches multiple locations");
  });

  test("given nonexistent file, when editing, then returns error", async () => {
    const result = await edit.execute({ path: join(TMP, "nope.txt"), edits: [{ oldText: "x", newText: "y" }] }, ctx);
    expect(result).toContain("Error: file not found");
  });

  test("given directory path, when editing, then returns error", async () => {
    const result = await edit.execute({ path: TMP, edits: [{ oldText: "x", newText: "y" }] }, ctx);
    expect(result).toContain("Error: not a file");
  });

  test("given empty newText, when editing, then deletes the matched text", async () => {
    const p = writeTmp("delete.txt", "aaa\nbbb\nccc");
    const result = await edit.execute({ path: p, edits: [{ oldText: "\nbbb", newText: "" }] }, ctx);
    expect(result).toContain("Edited");
    expect(readFileSync(p, "utf-8")).toBe("aaa\nccc");
  });

  test("given whitespace-sensitive match, when editing, then preserves exact match", async () => {
    const p = writeTmp("ws.txt", "  indented\n    deep");
    const result = await edit.execute({ path: p, edits: [{ oldText: "  indented", newText: "flat" }] }, ctx);
    expect(readFileSync(p, "utf-8")).toBe("flat\n    deep");
  });

  test("given edits array with two edits, when editing, then applies both sequentially", async () => {
    const p = writeTmp("multi-edit.txt", "aaa\nbbb\nccc");
    const result = await edit.execute({
      path: p,
      edits: [
        { oldText: "aaa", newText: "111" },
        { oldText: "ccc", newText: "333" },
      ],
    }, ctx);
    expect(result).toContain("edit 1");
    expect(result).toContain("edit 2");
    expect(readFileSync(p, "utf-8")).toBe("111\nbbb\n333");
  });

  test("given edits array where second edit fails, when editing, then file unchanged", async () => {
    const p = writeTmp("multi-fail.txt", "aaa\nbbb\nccc");
    const result = await edit.execute({
      path: p,
      edits: [
        { oldText: "aaa", newText: "111" },
        { oldText: "zzz", newText: "999" },
      ],
    }, ctx);
    expect(result).toContain("Edit 2: oldText not found");
    expect(readFileSync(p, "utf-8")).toBe("aaa\nbbb\nccc");
  });

  test("given empty edits array, when editing, then returns error", async () => {
    const p = writeTmp("empty-edit.txt", "hello");
    const result = await edit.execute({ path: p, edits: [] }, ctx);
    expect(result).toContain("Error: provide at least one edit");
  });
});
