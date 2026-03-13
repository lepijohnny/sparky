import { describe, expect, test } from "vitest";
import type { AgentToolDef } from "../../core/agent.types";
import { computeBudget, estimateTokens, estimateToolTokens } from "../chat.budget";
import { buildContext, type EntryFetcher } from "../chat.context";
import type { ChatEntry } from "../chat.types";

let rowidCounter = 1;

function userMsg(content: string, id = "m1"): ChatEntry {
  return { kind: "message", id, role: "user", content, timestamp: "2026-01-01T00:00:00Z", rowid: rowidCounter++ };
}

function assistantMsg(content: string, id = "m1"): ChatEntry {
  return { kind: "message", id, role: "assistant", content, timestamp: "2026-01-01T00:00:01Z", rowid: rowidCounter++ };
}

function toolStart(name: string, messageId: string, toolId: string): ChatEntry {
  return { kind: "activity", messageId, source: "agent", type: "agent.tool.start", timestamp: "2026-01-01T00:00:01Z", data: { id: toolId, name, input: {} }, rowid: rowidCounter++ };
}

function toolResult(messageId: string, toolId: string, output: string): ChatEntry {
  return { kind: "activity", messageId, source: "agent", type: "agent.tool.result", timestamp: "2026-01-01T00:00:02Z", data: { id: toolId, output }, rowid: rowidCounter++ };
}

/** Creates an EntryFetcher from a flat array of entries (simulates DB pagination). */
function arrayFetcher(entries: ChatEntry[]): EntryFetcher {
  return (pageSize: number, beforeRowid?: number) => {
    // Filter messages (pagination is message-based like the real DB)
    const messages = entries.filter((e) => e.kind === "message");
    const filtered = beforeRowid
      ? messages.filter((e) => (e.rowid ?? 0) < beforeRowid)
      : messages;

    // Take the last `pageSize` messages
    const pageMessages = filtered.slice(-pageSize);
    const hasMore = filtered.length > pageSize;

    if (pageMessages.length === 0) return { entries: [], hasMore: false };

    // Include all entries (messages + activities) within the rowid range
    const minRow = pageMessages[0].rowid ?? 0;
    const maxRow = beforeRowid ?? Number.MAX_SAFE_INTEGER;
    const page = entries.filter((e) => (e.rowid ?? 0) >= minRow && (e.rowid ?? 0) < maxRow);

    return { entries: page, hasMore };
  };
}

const TOOL_DEF: AgentToolDef = {
  name: "test_tool",
  description: "A test tool",
  parameters: { type: "object", properties: { arg: { type: "string", description: "an arg" } }, required: ["arg"] },
};

describe("estimateTokens", () => {
  test("given empty string, when estimating, then returns 0", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("given 100 chars, when estimating, then returns 25", () => {
    expect(estimateTokens("a".repeat(100))).toBe(25);
  });

  test("given 3 chars, when estimating, then rounds up to 1", () => {
    expect(estimateTokens("abc")).toBe(1);
  });
});

describe("computeBudget", () => {
  test("given context window and system prompt, when computing, then subtracts fixed costs", () => {
    const budget = computeBudget(8192, "You are helpful.");
    expect(budget.total).toBe(8192);
    expect(budget.system).toBeGreaterThan(0);
    expect(budget.tools).toBe(0);
    expect(budget.reserve).toBe(4096);
    expect(budget.available).toBe(budget.total - budget.system - budget.reserve);
  });

  test("given undefined context window, when computing, then uses 8192 default", () => {
    const budget = computeBudget(undefined, "Hello");
    expect(budget.total).toBe(8192);
  });

  test("given tools, when computing, then subtracts tool token cost", () => {
    const withoutTools = computeBudget(8192, "Hi");
    const withTools = computeBudget(8192, "Hi", [TOOL_DEF]);
    expect(withTools.tools).toBeGreaterThan(0);
    expect(withTools.available).toBeLessThan(withoutTools.available);
  });

  test("given tiny context window, when computing, then available is 0 not negative", () => {
    const budget = computeBudget(100, "a".repeat(400));
    expect(budget.available).toBe(0);
  });
});

describe("estimateToolTokens", () => {
  test("given empty tools, when estimating, then returns 0", () => {
    expect(estimateToolTokens([])).toBe(0);
  });

  test("given tool defs, when estimating, then returns positive count", () => {
    expect(estimateToolTokens([TOOL_DEF])).toBeGreaterThan(0);
  });
});

describe("buildContext", () => {
  test("given entries within budget, when building, then includes all turns", () => {
    const entries = [
      userMsg("Hello", "t1"),
      assistantMsg("Hi there!", "t1"),
      userMsg("How are you?", "t2"),
      assistantMsg("I'm great!", "t2"),
    ];

    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.includedTurns).toBe(2);
    expect(result.hasSkippedEntries).toBe(false);
    expect(result.messages).toHaveLength(4);
  });

  test("given entries exceeding budget, when building, then truncates oldest turns", () => {
    const entries: ChatEntry[] = [];
    for (let i = 0; i < 50; i++) {
      entries.push(userMsg("x".repeat(2000), `t${i}`));
      entries.push(assistantMsg("y".repeat(2000), `t${i}`));
    }

    const result = buildContext(arrayFetcher(entries), 8192, "System");
    expect(result.includedTurns).toBeLessThan(50);
    expect(result.hasSkippedEntries).toBe(true);
  });

  test("given entries exceeding budget, when building, then keeps newest turns", () => {
    const entries = [
      userMsg("x".repeat(4000), "t1"),
      assistantMsg("y".repeat(4000), "t1"),
      userMsg("new message", "t2"),
      assistantMsg("new reply", "t2"),
    ];

    const result = buildContext(arrayFetcher(entries), 5200, "System");
    expect(result.messages[0]).toEqual({ role: "user", content: "new message" });
  });

  test("given zero available budget, when building, then returns empty", () => {
    const entries = [userMsg("Hello", "t1")];
    const result = buildContext(arrayFetcher(entries), 100, "a".repeat(400));
    expect(result.messages).toHaveLength(0);
    expect(result.includedTurns).toBe(0);
  });

  test("given single entry exceeding budget, when building, then still includes latest turn", () => {
    const entries = [userMsg("x".repeat(10000), "t1")];
    const result = buildContext(arrayFetcher(entries), 8192, "System");
    expect(result.includedTurns).toBe(1);
    expect(result.messages).toHaveLength(1);
  });

  test("given tool calls, when building, then includes tool activities in turn", () => {
    const entries: ChatEntry[] = [
      userMsg("search for cats", "t1"),
      toolStart("search", "t1", "tc1"),
      toolResult("t1", "tc1", "found cats"),
      assistantMsg("Here are the results", "t1"),
    ];

    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.includedTurns).toBe(1);
    expect(result.messages).toHaveLength(3);
  });

  test("given tools in budget, when building, then reduces available for messages", () => {
    const entries = [
      userMsg("Hello", "t1"),
      assistantMsg("Hi!", "t1"),
    ];

    const without = buildContext(arrayFetcher(entries), 8192, "System");
    const withTools = buildContext(arrayFetcher(entries), 8192, "System", [TOOL_DEF]);
    expect(withTools.budget.available).toBeLessThan(without.budget.available);
  });

  test("given undefined context window, when building, then uses default 8192", () => {
    const entries = [userMsg("Hello", "t1")];
    const result = buildContext(arrayFetcher(entries), undefined, "System");
    expect(result.budget.total).toBe(8192);
  });

  test("given empty entries, when building, then returns empty messages", () => {
    const result = buildContext(arrayFetcher([]), 200_000, "System");
    expect(result.messages).toHaveLength(0);
    expect(result.includedTurns).toBe(0);
    expect(result.hasSkippedEntries).toBe(false);
  });

  test("given many entries, when building, then fetcher is called multiple times", () => {
    let fetchCount = 0;
    const entries: ChatEntry[] = [];
    for (let i = 0; i < 200; i++) {
      entries.push(userMsg(`msg ${i}`, `t${i}`));
      entries.push(assistantMsg(`reply ${i}`, `t${i}`));
    }

    const wrappedFetcher: EntryFetcher = (pageSize, beforeRowid) => {
      fetchCount++;
      return arrayFetcher(entries)(pageSize, beforeRowid);
    };

    // 200k window — all 200 turns fit, so fetcher should be called multiple times
    // to load all pages (200 messages / 50 per page = 4 pages)
    buildContext(wrappedFetcher, 200_000, "System");
    expect(fetchCount).toBeGreaterThan(1);
  });

  test("given small budget, when building, then fetcher stops early", () => {
    let fetchCount = 0;
    const entries: ChatEntry[] = [];
    for (let i = 0; i < 200; i++) {
      entries.push(userMsg("x".repeat(2000), `t${i}`));
      entries.push(assistantMsg("y".repeat(2000), `t${i}`));
    }

    const wrappedFetcher: EntryFetcher = (pageSize, beforeRowid) => {
      fetchCount++;
      return arrayFetcher(entries)(pageSize, beforeRowid);
    };

    // 8192 context — budget ~4090, each turn ~1000 tokens → 1 page is enough
    buildContext(wrappedFetcher, 8192, "System");
    expect(fetchCount).toBe(1);
  });
});
