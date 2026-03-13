import { describe, test, expect, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { extract, extensions } from "../extractors/txt/index";

const TMP = join(tmpdir(), `kt-txt-test-${randomUUID()}`);
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

describe("plain text extractor", () => {
  test("given extensions, then includes .txt", () => {
    expect(extensions).toContain(".txt");
  });

  test("given plain text, when extracted, then returns full text", async () => {
    const path = await writeTmpFile("test.txt", "Hello world");
    const result = await collectOne(extract(path, noop));
    expect(result.text).toBe("Hello world");
  });

  test("given text with double blank lines, when extracted, then sections are detected", async () => {
    const content = "First section.\n\n\nSecond section.\n\n\nThird section.";
    const path = await writeTmpFile("sections.txt", content);
    const result = await collectOne(extract(path, noop));
    expect(result.sections).toBeDefined();
    expect(result.sections!.length).toBeGreaterThanOrEqual(2);
  });

  test("given section offsets, when extracted, then offsets point to correct text", async () => {
    const content = "Part one.\n\n\nPart two.\n\n\nPart three.";
    const path = await writeTmpFile("offsets.txt", content);
    const result = await collectOne(extract(path, noop));
    for (const section of result.sections!) {
      expect(result.text[section.offset]).not.toBe("\n");
    }
  });

  test("given no double blank lines, when extracted, then sections is undefined", async () => {
    const content = "Just one paragraph.\nWith a single newline.";
    const path = await writeTmpFile("nosections.txt", content);
    const result = await collectOne(extract(path, noop));
    expect(result.sections).toBeUndefined();
  });

  test("given empty file, when extracted, then returns empty text", async () => {
    const path = await writeTmpFile("empty.txt", "");
    const result = await collectOne(extract(path, noop));
    expect(result.text).toBe("");
  });

  test("given trailing blank lines, when extracted, then no section points past end", async () => {
    const content = "Text here.\n\n\n";
    const path = await writeTmpFile("trailing.txt", content);
    const result = await collectOne(extract(path, noop));
    if (result.sections) {
      for (const section of result.sections) {
        expect(section.offset).toBeLessThan(result.text.length);
      }
    }
  });

  test("given text sections, when extracted, then sections have no labels", async () => {
    const content = "First.\n\n\nSecond.";
    const path = await writeTmpFile("nolabels.txt", content);
    const result = await collectOne(extract(path, noop));
    if (result.sections) {
      for (const section of result.sections) {
        expect(section.label).toBeUndefined();
      }
    }
  });
});
