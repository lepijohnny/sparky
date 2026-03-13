import { describe, test, expect, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { extract, extensions } from "../extractors/md/index";

const TMP = join(tmpdir(), `kt-md-test-${randomUUID()}`);
const noop = () => {};

async function writeTmpFile(name: string, content: string): Promise<string> {
  await mkdir(TMP, { recursive: true });
  const path = join(TMP, name);
  await writeFile(path, content);
  return path;
}

async function collectOne(gen: AsyncGenerator<{ text: string; sections?: { offset: number; label?: string }[] }>) {
  const results: { text: string; sections?: { offset: number; label?: string }[] }[] = [];
  for await (const r of gen) results.push(r);
  return results[0];
}

afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("markdown extractor", () => {
  test("given extensions, then includes .md", () => {
    expect(extensions).toContain(".md");
  });

  test("given plain markdown, when extracted, then returns full text", async () => {
    const path = await writeTmpFile("test.md", "# Hello\n\nWorld");
    const result = await collectOne(extract(path, noop));
    expect(result.text).toBe("# Hello\n\nWorld");
  });

  test("given frontmatter, when extracted, then frontmatter is stripped", async () => {
    const content = "---\ntitle: Test\ndate: 2024-01-01\n---\n\n# Hello\n\nBody text.";
    const path = await writeTmpFile("front.md", content);
    const result = await collectOne(extract(path, noop));
    expect(result.text).not.toContain("title: Test");
    expect(result.text).toContain("# Hello");
    expect(result.text).toContain("Body text.");
  });

  test("given headings, when extracted, then sections are detected", async () => {
    const content = "# Intro\nSome text.\n## Methods\nMore text.\n### Details\nFine text.";
    const path = await writeTmpFile("headings.md", content);
    const result = await collectOne(extract(path, noop));
    expect(result.sections).toBeDefined();
    expect(result.sections).toHaveLength(3);
    expect(result.sections![0].label).toBe("Intro");
    expect(result.sections![1].label).toBe("Methods");
    expect(result.sections![2].label).toBe("Details");
  });

  test("given heading offsets, when extracted, then offsets point to correct positions", async () => {
    const content = "# First\nText.\n# Second\nMore.";
    const path = await writeTmpFile("offsets.md", content);
    const result = await collectOne(extract(path, noop));
    for (const section of result.sections!) {
      expect(result.text.slice(section.offset)).toMatch(/^#/);
    }
  });

  test("given no headings, when extracted, then sections is undefined", async () => {
    const content = "Just plain text without any headings.";
    const path = await writeTmpFile("plain.md", content);
    const result = await collectOne(extract(path, noop));
    expect(result.sections).toBeUndefined();
  });

  test("given frontmatter without closing delimiter, when extracted, then text is returned as-is", async () => {
    const content = "---\ntitle: Broken\nno closing";
    const path = await writeTmpFile("broken.md", content);
    const result = await collectOne(extract(path, noop));
    expect(result.text).toBe(content);
  });

  test("given empty file, when extracted, then returns empty text", async () => {
    const path = await writeTmpFile("empty.md", "");
    const result = await collectOne(extract(path, noop));
    expect(result.text).toBe("");
  });

  test("given h4+ headings, when extracted, then not detected as sections", async () => {
    const content = "#### Deep heading\nText.";
    const path = await writeTmpFile("deep.md", content);
    const result = await collectOne(extract(path, noop));
    expect(result.sections).toBeUndefined();
  });
});
