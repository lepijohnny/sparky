import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { glob } from "../tool.glob";
import type { ToolContext } from "../tool.registry";
import { createEventBus } from "../../core/bus";

import { noopLogger } from "../../logger";

const TMP = join(import.meta.dirname, ".tmp-glob-test");

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

describe("app_glob", () => {
  const ctx = makeCtx();

  beforeAll(() => {
    mkdirSync(join(TMP, "src", "utils"), { recursive: true });
    mkdirSync(join(TMP, "docs"), { recursive: true });
    writeFileSync(join(TMP, "src", "index.ts"), "export {}");
    writeFileSync(join(TMP, "src", "app.ts"), "export {}");
    writeFileSync(join(TMP, "src", "utils", "helper.ts"), "export {}");
    writeFileSync(join(TMP, "docs", "readme.md"), "# Docs");
    writeFileSync(join(TMP, "package.json"), "{}");
  });

  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  test("given directory with files, when globbing all, then returns all entries", async () => {
    const result = await glob.execute({ pattern: "**/*", cwd: TMP }, ctx) as string;
    expect(result).toContain("src/index.ts");
    expect(result).toContain("package.json");
    expect(result).toContain("docs/readme.md");
  });

  test("given directory with ts files, when globbing *.ts, then returns only ts files", async () => {
    const result = await glob.execute({ pattern: "**/*.ts", cwd: TMP }, ctx) as string;
    expect(result).toContain("src/index.ts");
    expect(result).toContain("src/app.ts");
    expect(result).toContain("src/utils/helper.ts");
    expect(result).not.toContain("readme.md");
    expect(result).not.toContain("package.json");
  });

  test("given directory, when globbing subdirectory pattern, then returns scoped results", async () => {
    const result = await glob.execute({ pattern: "src/utils/*", cwd: TMP }, ctx) as string;
    expect(result).toContain("helper.ts");
    expect(result).not.toContain("index.ts");
  });

  test("given nonexistent cwd, when globbing, then returns error", async () => {
    const result = await glob.execute({ pattern: "*", cwd: join(TMP, "nope") }, ctx) as string;
    expect(result).toContain("Error: directory not found");
  });

  test("given no matches, when globbing, then returns no matches message", async () => {
    const result = await glob.execute({ pattern: "**/*.xyz", cwd: TMP }, ctx) as string;
    expect(result).toBe("No matches found.");
  });

  test("given directory entries, when globbing, then results are sorted", async () => {
    const result = await glob.execute({ pattern: "src/*.ts", cwd: TMP }, ctx) as string;
    const lines = result.split("\n");
    expect(lines[0]).toContain("app.ts");
    expect(lines[1]).toContain("index.ts");
  });
});
