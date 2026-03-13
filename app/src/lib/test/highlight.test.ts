import { describe, it, expect } from "vitest";
import { highlightText } from "../highlight";

describe("highlightText", () => {
  it("given no query, returns original string", () => {
    expect(highlightText("hello world", undefined)).toBe("hello world");
  });

  it("given empty query, returns original string", () => {
    expect(highlightText("hello world", "")).toBe("hello world");
  });

  it("given whitespace query, returns original string", () => {
    expect(highlightText("hello world", "   ")).toBe("hello world");
  });

  it("given single-char terms, filters them out and returns original", () => {
    expect(highlightText("hello a b", "a")).toBe("hello a b");
  });

  it("given no match, returns original string", () => {
    expect(highlightText("hello world", "xyz")).toBe("hello world");
  });

  it("given matching term, returns React elements with mark", () => {
    const result = highlightText("hello world", "hello");
    expect(typeof result).not.toBe("string");
  });

  it("given multiple terms, highlights all matches", () => {
    const result = highlightText("the cat sat on the mat", "cat mat");
    expect(typeof result).not.toBe("string");
  });

  it("given regex special chars in query, does not throw", () => {
    expect(() => highlightText("test (value)", "(value)")).not.toThrow();
  });

  it("given case-insensitive match, highlights regardless of case", () => {
    const result = highlightText("Hello World", "hello");
    expect(typeof result).not.toBe("string");
  });
});
