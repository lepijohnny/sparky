import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { read } from "../tool.read";
import type { ToolContext } from "../tool.registry";
import { createEventBus } from "../../core/bus";
import { ToolApproval } from "../../core/tool.approval";
import { noopLogger } from "../../logger";
import type { ToolAttachment } from "../../core/agent.types";

const TMP = join(import.meta.dirname, ".tmp-read-test");

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

function writeTmp(name: string, content: string | Buffer): string {
  const p = join(TMP, name);
  writeFileSync(p, content);
  return p;
}

describe("app_read", () => {
  const ctx = makeCtx();

  beforeAll(() => mkdirSync(TMP, { recursive: true }));
  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  test("given nonexistent file, when reading, then returns error", async () => {
    const result = await read.execute({ path: join(TMP, "nope.txt") }, ctx);
    expect(result).toContain("Error: file not found");
  });

  test("given directory path, when reading, then returns error", async () => {
    const result = await read.execute({ path: TMP }, ctx);
    expect(result).toContain("Error: not a file");
  });

  test("given small text file, when reading, then returns full content", async () => {
    const p = writeTmp("small.txt", "line1\nline2\nline3");
    const result = await read.execute({ path: p }, ctx);
    expect(result).toBe("line1\nline2\nline3");
  });

  test("given text file, when reading with offset, then returns from that line", async () => {
    const p = writeTmp("offset.txt", "a\nb\nc\nd\ne");
    const result = await read.execute({ path: p, offset: 3 }, ctx);
    expect(result).toBe("c\nd\ne");
  });

  test("given text file, when reading with limit, then returns limited lines with continuation hint", async () => {
    const p = writeTmp("limit.txt", "a\nb\nc\nd\ne");
    const result = await read.execute({ path: p, limit: 2 }, ctx);
    expect(result).toContain("a\nb");
    expect(result).toContain("3 more lines");
    expect(result).toContain("offset=3");
  });

  test("given text file, when reading with offset and limit, then returns correct slice", async () => {
    const p = writeTmp("both.txt", "a\nb\nc\nd\ne");
    const result = await read.execute({ path: p, offset: 2, limit: 2 }, ctx);
    expect(result).toContain("b\nc");
    expect(result).toContain("2 more lines");
    expect(result).toContain("offset=4");
  });

  test("given text file, when offset is beyond end, then returns error", async () => {
    const p = writeTmp("short.txt", "a\nb");
    const result = await read.execute({ path: p, offset: 100 }, ctx);
    expect(result).toContain("Error: offset 100 is beyond end of file");
  });

  test("given large text file, when reading without offset, then truncates by lines", async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`);
    const p = writeTmp("big.txt", lines.join("\n"));
    const result = await read.execute({ path: p }, ctx) as string;
    expect(result).toContain("line 1");
    expect(result).toContain("Showing lines 1-2000 of 3000");
    expect(result).toContain("offset=2001");
  });

  test("given file exceeding byte limit, when reading, then truncates by bytes", async () => {
    const longLine = "x".repeat(1000);
    const lines = Array.from({ length: 100 }, () => longLine);
    const p = writeTmp("bytes.txt", lines.join("\n"));
    const result = await read.execute({ path: p }, ctx) as string;
    expect(result).toContain("50.0KB limit");
    expect(result).toContain("offset=");
  });

  test("given single line exceeding byte limit, when reading, then returns bash hint", async () => {
    const hugeLine = "x".repeat(60 * 1024);
    const p = writeTmp("huge-line.txt", hugeLine);
    const result = await read.execute({ path: p }, ctx) as string;
    expect(result).toContain("exceeds");
    expect(result).toContain("sed -n");
  });

  test("given PNG file, when reading, then returns image attachment", async () => {
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    ]);
    const p = writeTmp("test.png", pngHeader);
    const result = await read.execute({ path: p }, ctx) as ToolAttachment;
    expect(result).toHaveProperty("text");
    expect(result.text).toContain("image/png");
    expect(result.binary).toHaveLength(1);
    expect(result.binary![0].mimeType).toBe("image/png");
  });

  test("given PDF file, when reading, then returns binary not supported error", async () => {
    const pdfHeader = Buffer.from("%PDF-1.4 fake content here for detection");
    const p = writeTmp("test.pdf", pdfHeader);
    const result = await read.execute({ path: p }, ctx);
    expect(result).toContain("Error: binary file");
    expect(result).toContain("not supported");
  });

  test("given api/ path, when reading, then resolves from prompts dir", async () => {
    const result = await read.execute({ path: "api/guidelines.md" }, ctx);
    expect(typeof result).toBe("string");
    expect(result as string).not.toContain("Error:");
    expect((result as string).length).toBeGreaterThan(0);
  });

  test("given formats/ path, when reading, then resolves from prompts dir", async () => {
    const result = await read.execute({ path: "formats/mermaid.md" }, ctx);
    expect(typeof result).toBe("string");
    expect(result as string).not.toContain("Error:");
  });

  test("given empty file, when reading, then returns empty string", async () => {
    const p = writeTmp("empty.txt", "");
    const result = await read.execute({ path: p }, ctx);
    expect(result).toBe("");
  });

});
