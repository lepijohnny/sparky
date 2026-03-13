import { describe, test, expect } from "vitest";
import { chunkText } from "../kt.chunker";

describe("kt.chunker", () => {
  test("given empty text, when chunked, then returns empty array", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   ")).toEqual([]);
  });

  test("given short text, when chunked, then returns single chunk", () => {
    const result = chunkText("Hello world");
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("Hello world");
    expect(result[0].startOffset).toBe(0);
    expect(result[0].endOffset).toBe(11);
    expect(result[0].tokenEstimate).toBeGreaterThan(0);
  });

  test("given text under chunk size, when chunked, then no splitting occurs", () => {
    const text = "A".repeat(1500);
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(text);
  });

  test("given long text, when chunked, then produces multiple chunks", () => {
    const text = Array(200).fill("This is a sentence. ").join("");
    const result = chunkText(text);
    expect(result.length).toBeGreaterThan(1);
  });

  test("given long text, when chunked, then chunks have overlap", () => {
    const text = Array(200).fill("This is a test sentence. ").join("");
    const result = chunkText(text);
    expect(result.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < result.length; i++) {
      expect(result[i].startOffset).toBeLessThan(result[i - 1].endOffset);
    }
  });

  test("given long text, when chunked, then all text is covered", () => {
    const text = Array(50).fill("Word ").join("").trim();
    const result = chunkText(text);
    expect(result[0].startOffset).toBe(0);
    expect(result[result.length - 1].endOffset).toBe(text.length);
  });

  test("given text with paragraph breaks, when chunked, then prefers splitting at paragraphs", () => {
    const para1 = "A".repeat(1200);
    const para2 = "B".repeat(1200);
    const text = para1 + "\n\n" + para2;
    const result = chunkText(text);
    expect(result.length).toBeGreaterThanOrEqual(2);

    const firstEnd = result[0].endOffset;
    const paraBreak = text.indexOf("\n\n") + 2;
    expect(firstEnd).toBe(paraBreak);
  });

  test("given text with sentences, when chunked, then prefers splitting at sentence boundaries", () => {
    const sentences = Array(40).fill("This is a fairly long sentence that takes up space. ").join("");
    const result = chunkText(sentences);
    expect(result.length).toBeGreaterThanOrEqual(2);

    for (const chunk of result.slice(0, -1)) {
      const trimmed = chunk.content.trimEnd();
      expect(trimmed).toMatch(/[.!?]$/);
    }
  });

  test("given tiny trailing segment, when chunked, then merges into previous chunk", () => {
    const text = "A".repeat(1900) + " " + "B".repeat(50);
    const result = chunkText(text);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(text);
  });

  test("given sections, when chunked, then small sections are merged into one chunk", () => {
    const text = "# Intro\nSome intro text.\n# Methods\nSome methods text.\n# Results\nSome results.";
    const sections = [
      { offset: 0, label: "Intro" },
      { offset: text.indexOf("# Methods"), label: "Methods" },
      { offset: text.indexOf("# Results"), label: "Results" },
    ];
    const result = chunkText(text, sections);

    expect(result.length).toBe(1);
    expect(result[0].content).toContain("Intro");
    expect(result[0].content).toContain("Methods");
    expect(result[0].content).toContain("Results");
  });

  test("given sections, when chunked, then each chunk has correct section label", () => {
    const sec1 = "A".repeat(500);
    const sec2 = "B".repeat(500);
    const text = sec1 + sec2;
    const sections = [
      { offset: 0, label: "First" },
      { offset: 500, label: "Second" },
    ];
    const result = chunkText(text, sections);

    for (const chunk of result) {
      if (chunk.startOffset < 500) expect(chunk.section).toBe("First");
      else expect(chunk.section).toBe("Second");
    }
  });

  test("given large section, when chunked, then section is split into multiple chunks", () => {
    const text = Array(100).fill("This is a long sentence in one section. ").join("");
    const sections = [{ offset: 0, label: "Big" }];
    const result = chunkText(text, sections);
    expect(result.length).toBeGreaterThan(1);
    for (const chunk of result) {
      expect(chunk.section).toBe("Big");
    }
  });

  test("given text before first section, when chunked, then prefixed text becomes its own chunk", () => {
    const preamble = "This is a preamble.\n\n";
    const body = "# Section 1\nBody text.";
    const text = preamble + body;
    const sections = [{ offset: preamble.length, label: "Section 1" }];
    const result = chunkText(text, sections);

    expect(result.length).toBe(2);
    expect(result[0].section).toBeUndefined();
    expect(result[0].content).toContain("preamble");
    expect(result[1].section).toBe("Section 1");
  });

  test("given whitespace-only section, when chunked, then skips it", () => {
    const text = "Content here." + " ".repeat(100) + "More content.";
    const sections = [
      { offset: 0, label: "First" },
      { offset: 13, label: "Empty" },
      { offset: 113, label: "Third" },
    ];
    const result = chunkText(text, sections);
    const labels = result.map((c) => c.section);
    expect(labels).not.toContain("Empty");
  });

  test("given chunks, when inspected, then tokenEstimate is roughly chars/4", () => {
    const text = "Hello world, this is a test of the chunking system.";
    const result = chunkText(text);
    expect(result[0].tokenEstimate).toBe(Math.ceil(text.length / 4));
  });

  test("given unsorted sections, when chunked, then sections are processed in order", () => {
    const text = "AAABBBCCC";
    const sections = [
      { offset: 6, label: "C" },
      { offset: 0, label: "A" },
      { offset: 3, label: "B" },
    ];
    const result = chunkText(text, sections);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("AAABBBCCC");
    expect(result[0].section).toBe("A");
  });
});
