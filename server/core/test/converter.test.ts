import { describe, test, expect } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { supportedAttachmentExtensions, getFileToMarkdownConverter } from "../md.converter";

const TMP = join(tmpdir(), `converter-test-${randomUUID()}`);

function tmpFile(name: string, content: string): string {
  mkdirSync(TMP, { recursive: true });
  const path = join(TMP, name);
  writeFileSync(path, content);
  return path;
}

function cleanup() {
  try { rmSync(TMP, { recursive: true, force: true }); } catch {}
}

const noop = () => {};

describe("supportedAttachmentExtensions", () => {
  test("given call, when invoked, then excludes image extensions", () => {
    const exts = supportedAttachmentExtensions();
    expect(exts).not.toContain("jpg");
    expect(exts).not.toContain("png");
    expect(exts).not.toContain("webp");
  });

  test("given call, when invoked, then includes document extensions", () => {
    const exts = supportedAttachmentExtensions();
    expect(exts).toContain("pdf");
    expect(exts).toContain("docx");
    expect(exts).toContain("xlsx");
    expect(exts).toContain("csv");
    expect(exts).toContain("json");
    expect(exts).toContain("md");
    expect(exts).toContain("txt");
    expect(exts).toContain("html");
  });

  test("given call, when invoked, then includes code extensions", () => {
    const exts = supportedAttachmentExtensions();
    expect(exts).toContain("py");
    expect(exts).toContain("ts");
    expect(exts).toContain("rs");
    expect(exts).toContain("go");
  });

  test("given call, when invoked, then excludes audio extensions", () => {
    const exts = supportedAttachmentExtensions();
    expect(exts).not.toContain("mp3");
    expect(exts).not.toContain("wav");
    expect(exts).not.toContain("flac");
    expect(exts).not.toContain("mp4");
  });
});

describe("getFileToMarkdownConverter", () => {
  test("given text file, when extracted, then yields content", async () => {
    const path = tmpFile("hello.txt", "Hello world");
    const converter = getFileToMarkdownConverter();
    const results: string[] = [];

    for await (const segment of converter.extract(path, noop)) {
      results.push(segment.text);
    }

    expect(results.length).toBe(1);
    expect(results[0]).toContain("Hello world");
    cleanup();
  });

  test("given markdown file with headings, when extracted, then includes sections", async () => {
    const content = "# Title\n\nSome text\n\n## Section A\n\nContent A\n\n## Section B\n\nContent B";
    const path = tmpFile("doc.md", content);
    const converter = getFileToMarkdownConverter();
    let sections: { offset: number; label?: string }[] | undefined;

    for await (const segment of converter.extract(path, noop)) {
      sections = segment.sections;
    }

    expect(sections).toBeDefined();
    expect(sections!.length).toBe(3);
    expect(sections![0].label).toBe("Title");
    expect(sections![1].label).toBe("Section A");
    expect(sections![2].label).toBe("Section B");
    cleanup();
  });

  test("given json file, when extracted, then yields json content", async () => {
    const path = tmpFile("config.json", '{"key": "value"}');
    const converter = getFileToMarkdownConverter();
    const results: string[] = [];

    for await (const segment of converter.extract(path, noop)) {
      results.push(segment.text);
    }

    expect(results.length).toBe(1);
    expect(results[0]).toContain("key");
    expect(results[0]).toContain("value");
    cleanup();
  });

  test("given csv file, when extracted, then yields table content", async () => {
    const path = tmpFile("data.csv", "name,age\nAlice,30\nBob,25");
    const converter = getFileToMarkdownConverter();
    const results: string[] = [];

    for await (const segment of converter.extract(path, noop)) {
      results.push(segment.text);
    }

    expect(results.length).toBe(1);
    expect(results[0]).toContain("Alice");
    expect(results[0]).toContain("Bob");
    cleanup();
  });

  test("given large content with maxOutputChars, when extracted, then throws", async () => {
    const content = "x".repeat(200);
    const path = tmpFile("big.txt", content);
    const converter = getFileToMarkdownConverter({ maxOutputChars: 50 });

    await expect(async () => {
      for await (const _ of converter.extract(path, noop)) {}
    }).rejects.toThrow("too large");
    cleanup();
  });

  test("given small content with maxOutputChars, when extracted, then succeeds", async () => {
    const content = "small text";
    const path = tmpFile("small.txt", content);
    const converter = getFileToMarkdownConverter({ maxOutputChars: 100_000 });
    const results: string[] = [];

    for await (const segment of converter.extract(path, noop)) {
      results.push(segment.text);
    }

    expect(results.length).toBe(1);
    expect(results[0]).toContain("small text");
    cleanup();
  });

  test("given no maxOutputChars, when large content extracted, then succeeds", async () => {
    const content = "x".repeat(200_000);
    const path = tmpFile("huge.txt", content);
    const converter = getFileToMarkdownConverter();
    const results: string[] = [];

    for await (const segment of converter.extract(path, noop)) {
      results.push(segment.text);
    }

    expect(results.length).toBe(1);
    expect(results[0].length).toBeGreaterThan(100_000);
    cleanup();
  });

  test("given converter, when extensions checked, then has dot-prefixed extensions", () => {
    const converter = getFileToMarkdownConverter();
    expect(converter.extensions).toContain(".pdf");
    expect(converter.extensions).toContain(".txt");
    expect(converter.extensions).toContain(".md");
    expect(converter.extensions).toContain(".json");
    expect(converter.extensions.every((e) => e.startsWith("."))).toBe(true);
  });

  test("given converter, when log callback provided, then logs extraction", async () => {
    const path = tmpFile("logged.txt", "test content");
    const converter = getFileToMarkdownConverter();
    const logs: string[] = [];

    for await (const _ of converter.extract(path, (msg) => logs.push(msg))) {}

    expect(logs.some((l) => l.includes("Extraction"))).toBe(true);
    cleanup();
  });
});
