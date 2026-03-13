import { describe, expect, test } from "vitest";
import type { MessageContent } from "../agent.types";
import { getPrompt } from "../adapters/adapter.encode64";

describe("getPrompt", () => {
  test("given a plain string, when called, then returns the string", () => {
    expect(getPrompt("hello")).toBe("hello");
  });

  test("given a single text part, when called, then returns the text", () => {
    const content: MessageContent = [{ type: "text", text: "hello" }];
    expect(getPrompt(content)).toBe("hello");
  });

  test("given text and image parts, when called, then returns only text", () => {
    const content: MessageContent = [
      { type: "text", text: "What is this?" },
      { type: "image", filePath: "/tmp/photo.png", mimeType: "image/png" },
    ];
    expect(getPrompt(content)).toBe("What is this?");
  });

  test("given multiple text parts, when called, then concatenates them", () => {
    const content: MessageContent = [
      { type: "text", text: "Hello " },
      { type: "text", text: "world" },
    ];
    expect(getPrompt(content)).toBe("Hello world");
  });

  test("given only image parts, when called, then returns empty string", () => {
    const content: MessageContent = [
      { type: "image", filePath: "/tmp/a.png", mimeType: "image/png" },
    ];
    expect(getPrompt(content)).toBe("");
  });

  test("given empty array, when called, then returns empty string", () => {
    expect(getPrompt([])).toBe("");
  });
});


