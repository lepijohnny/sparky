import { describe, test, expect } from "vitest";
import { stripToolPrefix, inferCategory, fallbackSummary } from "../chat.conversation.loop";

describe("stripToolPrefix", () => {
  test("given mcp prefixed name, when stripping, then prefix is removed", () => {
    expect(stripToolPrefix("mcp__server__tool_name")).toBe("tool_name");
  });

  test("given unprefixed name, when stripping, then unchanged", () => {
    expect(stripToolPrefix("search")).toBe("search");
  });

  test("given double underscore in tool name, when stripping, then only prefix removed", () => {
    expect(stripToolPrefix("mcp__srv__my__tool")).toBe("my__tool");
  });
});

describe("inferCategory", () => {
  test("given bus_emit with settings.labels event, when inferring, then returns label", () => {
    expect(inferCategory("app_bus_emit", { event: "settings.labels.create" })).toBe("label");
  });

  test("given bus_emit with chat.label event, when inferring, then returns label", () => {
    expect(inferCategory("app_bus_emit", { event: "chat.label.add" })).toBe("label");
  });

  test("given bus_emit with settings.llm event, when inferring, then returns connection", () => {
    expect(inferCategory("app_bus_emit", { event: "settings.llm.update" })).toBe("connection");
  });

  test("given bus_emit with chat event, when inferring, then returns chat", () => {
    expect(inferCategory("app_bus_emit", { event: "chat.rename" })).toBe("chat");
  });

  test("given non bus_emit tool, when inferring, then returns system", () => {
    expect(inferCategory("search", {})).toBe("system");
  });

  test("given bus_emit with unknown event, when inferring, then returns system", () => {
    expect(inferCategory("app_bus_emit", { event: "unknown.thing" })).toBe("system");
  });
});

describe("fallbackSummary", () => {
  test("given JSON with ok:true, when summarizing, then returns Done", () => {
    expect(fallbackSummary('{"ok":true}')).toBe("Done");
  });

  test("given JSON with array, when summarizing, then returns count", () => {
    expect(fallbackSummary('{"items":[1,2,3]}')).toBe("3 items");
  });

  test("given JSON with name, when summarizing, then returns quoted name", () => {
    expect(fallbackSummary('{"name":"My Chat"}')).toBe('"My Chat"');
  });

  test("given long string, when summarizing, then truncates at 48 chars", () => {
    const long = "A".repeat(100);
    const result = fallbackSummary(long);
    expect(result.length).toBeLessThanOrEqual(49);
    expect(result).toContain("…");
  });

  test("given short string, when summarizing, then returns as-is", () => {
    expect(fallbackSummary("hello")).toBe("hello");
  });
});
