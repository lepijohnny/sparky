import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { grep } from "../tool.grep";
import type { ToolContext } from "../tool.registry";
import { createEventBus } from "../../core/bus";
import { ToolApproval } from "../../core/tool.approval";
import { noopLogger } from "../../logger";

const TMP = join(import.meta.dirname, ".tmp-grep-test");

function makeCtx(): ToolContext {
  const bus = createEventBus(noopLogger);
  const approval = new ToolApproval(bus, noopLogger);
  return {
    bus,
    log: noopLogger,
    role: "sparky",
    signal: new AbortController().signal,
    approval,
    approvalCtx: { chatId: "c1", turnId: "t1" },
  };
}

describe("app_grep", () => {
  const ctx = makeCtx();

  beforeAll(() => {
    mkdirSync(join(TMP, "src"), { recursive: true });
    writeFileSync(join(TMP, "src", "user.ts"), "export function createUser() {\n  return { name: 'Alice' };\n}\n");
    writeFileSync(join(TMP, "src", "admin.ts"), "export function createAdmin() {\n  return createUser();\n}\n");
    writeFileSync(join(TMP, "readme.md"), "# Project\nThis project creates users.\n");
  });

  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  test("given files with pattern, when grepping, then returns matching lines with line numbers", async () => {
    const result = await grep.execute({ pattern: "createUser", path: TMP }, ctx) as string;
    expect(result).toContain("createUser");
    expect(result).toMatch(/:\d+:/);
  });

  test("given files with pattern, when grepping, then finds matches in multiple files", async () => {
    const result = await grep.execute({ pattern: "createUser", path: TMP }, ctx) as string;
    expect(result).toContain("user.ts");
    expect(result).toContain("admin.ts");
  });

  test("given no matches, when grepping, then returns no matches message", async () => {
    const result = await grep.execute({ pattern: "nonexistentXYZ", path: TMP }, ctx) as string;
    expect(result).toBe("No matches found.");
  });

  test("given case mismatch, when grepping with ignoreCase, then finds matches", async () => {
    const result = await grep.execute({ pattern: "CREATEUSER", path: TMP, ignoreCase: true }, ctx) as string;
    expect(result).toContain("createUser");
  });

  test("given case mismatch, when grepping without ignoreCase, then no matches", async () => {
    const result = await grep.execute({ pattern: "CREATEUSER", path: TMP }, ctx) as string;
    expect(result).toBe("No matches found.");
  });

  test("given nonexistent path, when grepping, then returns error", async () => {
    const result = await grep.execute({ pattern: "test", path: join(TMP, "nope") }, ctx) as string;
    expect(result).toContain("Error: path not found");
  });

  test("given single file, when grepping, then searches only that file", async () => {
    const result = await grep.execute({ pattern: "createUser", path: join(TMP, "src", "user.ts") }, ctx) as string;
    expect(result).toContain("createUser");
    expect(result).not.toContain("admin.ts");
  });

  test("given file with long line, when grepping, then truncates line", async () => {
    const longLine = "match_here " + "x".repeat(600);
    writeFileSync(join(TMP, "long.txt"), longLine);
    const result = await grep.execute({ pattern: "match_here", path: join(TMP, "long.txt") }, ctx) as string;
    expect(result).toContain("[truncated]");
  });
});
