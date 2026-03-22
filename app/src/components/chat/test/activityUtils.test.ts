import { describe, expect, test, beforeEach } from "vitest";
import type { ChatActivity } from "../../../types/chat";
import {
  truncate,
  toolLabel,
  getActivityLabel,
  mergeToolActivities,
  filterActivities,
  expandedGroups,
} from "../../../lib/activityUtils";

function activity(type: string, data?: any): ChatActivity {
  return {
    kind: "activity",
    messageId: "turn-1",
    source: "agent",
    type: type as any,
    timestamp: new Date().toISOString(),
    ...(data ? { data } : {}),
  };
}

describe("truncate", () => {
  test("given short string, when truncated, then returns unchanged", () => {
    expect(truncate("hello", 64)).toBe("hello");
  });

  test("given long string, when truncated, then adds ellipsis", () => {
    const long = "a".repeat(100);
    const result = truncate(long, 64);
    expect(result.length).toBe(65);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("toolLabel", () => {
  test("given bus_emit with chat event, when labeled, then returns Chat", () => {
    expect(toolLabel("app_bus_emit", { event: "chat.list" })).toBe("Chat");
  });

  test("given bus_emit with settings event, when labeled, then returns Settings", () => {
    expect(toolLabel("app_bus_emit", { event: "settings.labels.create" })).toBe("Settings");
  });

  test("given bus_emit with skills event, when labeled, then returns Skills", () => {
    expect(toolLabel("app_bus_emit", { event: "skills.create" })).toBe("Skills");
  });

  test("given bus_emit without event, when labeled, then returns App", () => {
    expect(toolLabel("app_bus_emit", {})).toBe("App");
  });

  test("given tool with label, when labeled, then returns label", () => {
    expect(toolLabel("app_read", { path: "foo.ts" }, "Reading")).toBe("Reading");
  });

  test("given tool without label, when labeled, then returns tool name", () => {
    expect(toolLabel("report_intent", {})).toBe("report_intent");
  });
});

describe("getActivityLabel", () => {
  test("given agent.start, when labeled, then returns null", () => {
    expect(getActivityLabel(activity("agent.start"))).toBeNull();
  });

  test("given thinking.start, when labeled, then returns Thinking", () => {
    expect(getActivityLabel(activity("agent.thinking.start"))).toBe("Thinking");
  });

  test("given tool.start bus_emit, when labeled, then returns domain label", () => {
    const a = activity("agent.tool.start", { name: "app_bus_emit", input: { event: "settings.labels.list" } });
    expect(getActivityLabel(a)).toBe("Settings");
  });

  test("given tool.start with summary, when labeled, then returns summary", () => {
    const a = activity("agent.tool.start", { name: "app_read", input: { path: "src/index.ts" }, summary: "src/index.ts" });
    expect(getActivityLabel(a)).toBe("src/index.ts");
  });

  test("given tool.result with summary, when labeled, then returns summary", () => {
    const a = activity("agent.tool.result", { id: "1", output: "{}", summary: "Listed labels, 3 found" });
    expect(getActivityLabel(a)).toBe("Listed labels, 3 found");
  });

  test("given tool.result without summary, when labeled, then returns truncated output", () => {
    const a = activity("agent.tool.result", { id: "1", output: '{"labels":[]}' });
    expect(getActivityLabel(a)).toBe('{"labels":[]}');
  });

  test("given knowledge with summary, when labeled, then returns summary", () => {
    const a = activity("agent.knowledge", { sources: [], summary: "2 files · 5 sections" });
    expect(getActivityLabel(a)).toBe("2 files · 5 sections");
  });

  test("given knowledge without summary, when labeled, then returns source count", () => {
    const a = activity("agent.knowledge", { sources: [{}, {}, {}] });
    expect(getActivityLabel(a)).toBe("3 sources");
  });

  test("given error, when labeled, then returns error message", () => {
    const a = activity("agent.error", { message: "Auth failed" });
    expect(getActivityLabel(a)).toBe("Error: Auth failed");
  });
});

describe("filterActivities", () => {
  test("given agent.start, when filtered, then removed", () => {
    const result = filterActivities([activity("agent.start")]);
    expect(result).toHaveLength(0);
  });

  test("given agent.thinking.done, when filtered, then removed", () => {
    const result = filterActivities([activity("agent.thinking.done")]);
    expect(result).toHaveLength(0);
  });

  test("given agent.thinking.start, when filtered, then removed", () => {
    const result = filterActivities([activity("agent.thinking.start")]);
    expect(result).toHaveLength(0);
  });

  test("given agent.thinking.delta, when filtered, then removed", () => {
    const result = filterActivities([activity("agent.thinking.delta")]);
    expect(result).toHaveLength(0);
  });

  test("given app_read tool.start, when filtered, then kept", () => {
    const start = activity("agent.tool.start", { id: "1", name: "app_read", input: { path: "readme.md" } });
    const result = filterActivities([start]);
    expect(result).toHaveLength(1);
  });

  test("given visible tool, when filtered, then kept", () => {
    const start = activity("agent.tool.start", { id: "1", name: "app_bus_emit", input: { event: "chat.list" } });
    const end = activity("agent.tool.result", { id: "1", output: "{}", summary: "Done" });
    const result = filterActivities([start, end]);
    expect(result).toHaveLength(2);
  });
});

describe("mergeToolActivities", () => {
  test("given start and result with same id, when merged, then produces single row", () => {
    const start = activity("agent.tool.start", { id: "c1", name: "app_bus_emit", input: { event: "chat.list" }, label: "Managing" });
    const result = activity("agent.tool.result", { id: "c1", output: "{}", summary: "Listed chats, 5 found", category: "chat" });
    const merged = mergeToolActivities([start, result]);
    expect(merged).toHaveLength(1);
    expect(merged[0].data.mergedLabel).toBe("Chat → Listed chats, 5 found");
  });

  test("given start without matching result, when merged, then kept as-is", () => {
    const start = activity("agent.tool.start", { id: "c1", name: "app_bus_emit", input: { event: "chat.list" } });
    const merged = mergeToolActivities([start]);
    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe("agent.tool.start");
  });

  test("given result without matching start, when merged, then kept as-is", () => {
    const result = activity("agent.tool.result", { id: "c1", output: "{}", summary: "Done" });
    const merged = mergeToolActivities([result]);
    expect(merged).toHaveLength(1);
    expect(merged[0].type).toBe("agent.tool.result");
  });

  test("given tool with label and icon, when merged, then icon propagates from start", () => {
    const start = activity("agent.tool.start", { id: "c1", name: "app_read", input: { path: "foo.ts" }, label: "Reading", icon: "file-text" });
    const result = activity("agent.tool.result", { id: "c1", output: "content", summary: "Read foo.ts" });
    const merged = mergeToolActivities([start, result]);
    expect(merged).toHaveLength(1);
    expect(merged[0].data.mergedLabel).toBe("Reading → Read foo.ts");  // result summary unchanged
    expect(merged[0].data.icon).toBe("file-text");
  });

  test("given non-tool activities, when merged, then passed through", () => {
    const thinking = activity("agent.thinking.start");
    const error = activity("agent.error", { message: "fail" });
    const merged = mergeToolActivities([thinking, error]);
    expect(merged).toHaveLength(2);
  });

  test("given multiple tool pairs, when merged, then each pair produces one row", () => {
    const s1 = activity("agent.tool.start", { id: "c1", name: "app_bus_emit", input: { event: "chat.list" }, label: "Managing" });
    const r1 = activity("agent.tool.result", { id: "c1", output: "{}", summary: "5 chats" });
    const s2 = activity("agent.tool.start", { id: "c2", name: "app_bus_emit", input: { event: "chat.create" }, label: "Managing" });
    const r2 = activity("agent.tool.result", { id: "c2", output: "{}", summary: '"New Chat"' });
    const merged = mergeToolActivities([s1, r1, s2, r2]);
    expect(merged).toHaveLength(2);
    expect(merged[0].data.mergedLabel).toBe("Chat → 5 chats");
    expect(merged[1].data.mergedLabel).toBe('Chat → "New Chat"');
  });
});

describe("expandedGroups", () => {
  beforeEach(() => {
    expandedGroups.clear();
  });

  test("given streaming expanded, when checking real id, then transfers state", () => {
    expandedGroups.add("streaming");
    expect(expandedGroups.has("streaming")).toBe(true);

    if (expandedGroups.has("streaming")) {
      expandedGroups.delete("streaming");
      expandedGroups.add("real-id-123");
    }

    expect(expandedGroups.has("streaming")).toBe(false);
    expect(expandedGroups.has("real-id-123")).toBe(true);
  });

  test("given no streaming state, when checking real id, then not expanded", () => {
    expect(expandedGroups.has("real-id-123")).toBe(false);
  });
});
