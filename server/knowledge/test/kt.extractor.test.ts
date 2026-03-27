import { describe, test, expect } from "vitest";
import { ExtractorRegistry } from "../kt.extractor";
import type { FileMdConverter } from "../kt.types";

function mockExtractor(extensions: string[]): FileMdConverter {
  return {
    extensions,
    extract: async function*() { yield { text: "mock" }; },
  };
}

describe("kt.extractor registry", () => {
  test("given registered extractor, when get is called with matching ext, then returns it", () => {
    const reg = new ExtractorRegistry();
    const ext = mockExtractor([".md"]);
    reg.register(ext);
    expect(reg.get(".md")).toBe(ext);
  });

  test("given registered extractor, when get is called with unknown ext, then returns null", () => {
    const reg = new ExtractorRegistry();
    reg.register(mockExtractor([".md"]));
    expect(reg.get(".pdf")).toBeNull();
  });

  test("given extractor with multiple extensions, when registered, then all extensions resolve", () => {
    const reg = new ExtractorRegistry();
    const ext = mockExtractor([".md", ".mdx", ".markdown"]);
    reg.register(ext);
    expect(reg.get(".md")).toBe(ext);
    expect(reg.get(".mdx")).toBe(ext);
    expect(reg.get(".markdown")).toBe(ext);
  });

  test("given uppercase extension, when get is called, then matches case-insensitively", () => {
    const reg = new ExtractorRegistry();
    reg.register(mockExtractor([".MD"]));
    expect(reg.get(".md")).not.toBeNull();
  });

  test("given lowercase lookup, when extractor registered with uppercase, then matches", () => {
    const reg = new ExtractorRegistry();
    reg.register(mockExtractor([".txt"]));
    expect(reg.get(".TXT")).not.toBeNull();
  });

  test("given multiple extractors, when supportedExtensions is called, then returns all", () => {
    const reg = new ExtractorRegistry();
    reg.register(mockExtractor([".md"]));
    reg.register(mockExtractor([".txt"]));
    reg.register(mockExtractor([".pdf"]));
    const exts = reg.supportedExtensions();
    expect(exts).toContain(".md");
    expect(exts).toContain(".txt");
    expect(exts).toContain(".pdf");
    expect(exts).toHaveLength(3);
  });

  test("given empty registry, when supportedExtensions is called, then returns empty array", () => {
    const reg = new ExtractorRegistry();
    expect(reg.supportedExtensions()).toEqual([]);
  });

  test("given empty registry, when get is called, then returns null", () => {
    const reg = new ExtractorRegistry();
    expect(reg.get(".anything")).toBeNull();
  });

  test("given two extractors for same extension, when registered, then last one wins", () => {
    const reg = new ExtractorRegistry();
    const first = mockExtractor([".md"]);
    const second = mockExtractor([".md"]);
    reg.register(first);
    reg.register(second);
    expect(reg.get(".md")).toBe(second);
  });
});
