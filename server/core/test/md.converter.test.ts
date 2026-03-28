import { describe, test, expect } from "vitest";
import {
  recognizeMarkdownSegments,
  splitIntoSegments,
  appendTableHeader,
  splitByLines,
} from "../md.converter";

async function collect<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

describe("recognizeMarkdownSegments", () => {
  test("given text with h1 h2 h3 headings, when parsed, then returns all", () => {
    const text = "# H1\n\ntext\n\n## H2\n\ntext\n\n### H3\n\ntext";
    const sections = recognizeMarkdownSegments(text);
    expect(sections.length).toBe(3);
    expect(sections[0].label).toBe("H1");
    expect(sections[1].label).toBe("H2");
    expect(sections[2].label).toBe("H3");
  });

  test("given text with no headings, when parsed, then returns empty", () => {
    expect(recognizeMarkdownSegments("just plain text\nno headings")).toEqual([]);
  });

  test("given text with h4+ headings, when parsed, then ignores them", () => {
    expect(recognizeMarkdownSegments("#### H4\n\ntext")).toEqual([]);
  });

  test("given empty text, when parsed, then returns empty", () => {
    expect(recognizeMarkdownSegments("")).toEqual([]);
  });

  test("given heading with offset, when parsed, then offset is correct", () => {
    const text = "preamble\n\n# Title\n\ntext";
    const sections = recognizeMarkdownSegments(text);
    expect(sections[0].offset).toBe(10);
    expect(sections[0].label).toBe("Title");
  });
});

describe("splitIntoSegments", () => {
  test("given text with no sections, when split, then yields full text", async () => {
    const result = await collect(splitIntoSegments("hello world", []));
    expect(result.length).toBe(1);
    expect(result[0]).toBe("hello world");
  });

  test("given text with one section, when split, then yields full text", async () => {
    const sections = [{ offset: 0, label: "Title" }];
    const result = await collect(splitIntoSegments("# Title\n\ncontent", sections));
    expect(result.length).toBe(1);
  });

  test("given text with two h1 sections, when split, then yields two segments", async () => {
    const text = "# Chapter 1\n\nContent A\n\n# Chapter 2\n\nContent B";
    const sections = recognizeMarkdownSegments(text);
    const result = await collect(splitIntoSegments(text, sections));
    expect(result.length).toBe(2);
    expect(result[0]).toContain("Chapter 1");
    expect(result[1]).toContain("Chapter 2");
  });

  test("given text with preamble before first heading, when split, then includes preamble", async () => {
    const text = "This is a preamble.\n\n# Chapter 1\n\nContent\n\n# Chapter 2\n\nMore";
    const sections = recognizeMarkdownSegments(text);
    const result = await collect(splitIntoSegments(text, sections));
    expect(result.length).toBe(3);
    expect(result[0]).toBe("This is a preamble.");
    expect(result[1]).toContain("Chapter 1");
  });

  test("given text with only h3 sections, when split, then falls back to h3 splits", async () => {
    const text = "### A\n\nContent A\n\n### B\n\nContent B\n\n### C\n\nContent C";
    const sections = recognizeMarkdownSegments(text);
    const result = await collect(splitIntoSegments(text, sections));
    expect(result.length).toBe(3);
  });

  test("given text with mixed h1 and h2, when split, then uses h1+h2 as top level", async () => {
    const text = "# H1\n\nText\n\n## H2\n\nText\n\n### H3\n\nDeep";
    const sections = recognizeMarkdownSegments(text);
    const result = await collect(splitIntoSegments(text, sections));
    expect(result.length).toBe(2);
  });

  test("given whitespace-only segments, when split, then skips them", async () => {
    const text = "# A\n\n   \n\n# B\n\nContent";
    const sections = recognizeMarkdownSegments(text);
    const result = await collect(splitIntoSegments(text, sections));
    for (const seg of result) {
      expect(seg.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("appendTableHeader", () => {
  test("given markdown table lines, when appending header, then prepends header and separator", () => {
    const lines = ["| A | B |", "| --- | --- |", "| 1 | 2 |", "| 3 | 4 |"];
    const result = appendTableHeader(lines, ["| 5 | 6 |", "| 7 | 8 |"]);
    expect(result).toBe("| A | B |\n| --- | --- |\n| 5 | 6 |\n| 7 | 8 |");
  });

  test("given non-table lines, when appending header, then returns chunk as-is", () => {
    const lines = ["just text", "more text"];
    const result = appendTableHeader(lines, ["chunk line 1", "chunk line 2"]);
    expect(result).toBe("chunk line 1\nchunk line 2");
  });

  test("given table without separator, when appending header, then returns chunk as-is", () => {
    const lines = ["| A | B |", "no separator", "| 1 | 2 |"];
    const result = appendTableHeader(lines, ["| 3 | 4 |"]);
    expect(result).toBe("| 3 | 4 |");
  });

  test("given empty lines, when appending header, then returns chunk", () => {
    const result = appendTableHeader([], ["data"]);
    expect(result).toBe("data");
  });
});

describe("splitByLines", () => {
  test("given text under limit, when split, then returns single item", () => {
    const text = Array(100).fill("line").join("\n");
    const result = splitByLines(text);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(text);
  });

  test("given text over limit, when split, then returns multiple groups", () => {
    const text = Array(1200).fill("line").join("\n");
    const result = splitByLines(text);
    expect(result.length).toBe(3);
  });

  test("given markdown table over limit, when split, then each group has header", () => {
    const header = "| Name | Age |";
    const sep = "| --- | --- |";
    const rows = Array(1000).fill("| Alice | 30 |");
    const text = [header, sep, ...rows].join("\n");
    const result = splitByLines(text);
    expect(result.length).toBe(2);
    expect(result[0]).toContain("| Name | Age |");
    expect(result[0]).toContain("| --- | --- |");
    expect(result[1]).toContain("| Name | Age |");
    expect(result[1]).toContain("| --- | --- |");
  });

  test("given markdown table under limit, when split, then returns single item", () => {
    const text = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const result = splitByLines(text);
    expect(result.length).toBe(1);
    expect(result[0]).toBe(text);
  });

  test("given plain text over limit, when split, then no header prepended", () => {
    const text = Array(600).fill("plain line").join("\n");
    const result = splitByLines(text);
    expect(result.length).toBe(2);
    expect(result[0].startsWith("plain line")).toBe(true);
    expect(result[1].startsWith("plain line")).toBe(true);
  });

  test("given exact limit lines, when split, then returns single item", () => {
    const text = Array(500).fill("line").join("\n");
    const result = splitByLines(text);
    expect(result.length).toBe(1);
  });

  test("given limit + 1 lines, when split, then returns two groups", () => {
    const text = Array(501).fill("line").join("\n");
    const result = splitByLines(text);
    expect(result.length).toBe(2);
  });

  test("given table with many rows, when split, then last group has remaining rows", () => {
    const header = "| Col |";
    const sep = "| --- |";
    const rows = Array(750).fill("| val |");
    const text = [header, sep, ...rows].join("\n");
    const result = splitByLines(text);
    expect(result.length).toBe(2);
    const lastGroupLines = result[1].split("\n");
    expect(lastGroupLines[0]).toBe("| Col |");
    expect(lastGroupLines[1]).toBe("| --- |");
    expect(lastGroupLines.length).toBe(252);
  });
});
