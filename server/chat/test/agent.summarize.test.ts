import { describe, test, expect } from "vitest";
import { MockAgent, type MockScenario } from "../../core/adapters/agent.mock";
import { ChatDatabase } from "../chat.db";
import { generateSummary, shouldSummarize } from "../agent.summarize";
import type { ContextResult } from "../chat.context";
import { noopLogger } from "../../logger";
import type { Chat, ChatSummary } from "../chat.types";

function setup() {
  return new ChatDatabase(":memory:", noopLogger);
}

function makeChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: crypto.randomUUID(),
    name: "Test Chat",
    provider: "mock",
    model: "mock-model",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function summaryAgent(text: string): MockAgent {
  return new MockAgent({
    id: "summarizer",
    description: "Returns a fixed summary",
    rounds: [{
      events: [
        { delay: 0, event: { type: "text.delta", content: text } },
        { delay: 0, event: { type: "text.done", content: text } },
        { delay: 0, event: { type: "done" } },
      ],
    }],
  });
}

function populateChat(db: ChatDatabase, chatId: string, messageCount: number): number[] {
  const rowids: number[] = [];
  for (let i = 0; i < messageCount; i++) {
    const r1 = db.addEntry(chatId, { kind: "message", id: `t${i}`, role: "user", content: `Question ${i}`, timestamp: `t${i}a` });
    const r2 = db.addEntry(chatId, { kind: "message", id: `t${i}`, role: "assistant", content: `Answer ${i}`, timestamp: `t${i}b` });
    rowids.push(r1, r2);
  }
  return rowids;
}

function makeCtx(overrides: Partial<ContextResult> = {}): ContextResult {
  return {
    system: "",
    messages: [],
    budget: {
      total: 200_000,
      reserve: 4096,
      systemTokens: 850,
      toolTokens: 0,
      anchorTokens: 0,
      summaryTokens: 0,
      servicesTokens: 0,
      skillsTokens: 0,
      knowledgeTokens: 0,
      conversationTokens: 8000,
      remaining: 2000,
    },
    includedTurns: 10,
    skippedTurns: 5,
    knowledgeChunks: 0,
    hasSkippedEntries: true,
    lastKnownMemoryId: 100,
    ...overrides,
  };
}

describe("shouldSummarize — trigger logic", () => {
  test("given 80% usage and skipped entries, when checking, then returns true", () => {
    const ctx = makeCtx({ budget: { ...makeCtx().budget, conversationTokens: 8000, remaining: 2000 } });
    expect(shouldSummarize(ctx, null)).toBe(true);
  });

  test("given 50% usage, when checking, then returns false", () => {
    const ctx = makeCtx({ budget: { ...makeCtx().budget, conversationTokens: 5000, remaining: 5000 } });
    expect(shouldSummarize(ctx, null)).toBe(false);
  });

  test("given exactly 60% usage, when checking, then returns true", () => {
    const ctx = makeCtx({ budget: { ...makeCtx().budget, conversationTokens: 6000, remaining: 4000 } });
    expect(shouldSummarize(ctx, null)).toBe(true);
  });

  test("given 59% usage, when checking, then returns false", () => {
    const ctx = makeCtx({ budget: { ...makeCtx().budget, conversationTokens: 59, remaining: 41 } });
    expect(shouldSummarize(ctx, null)).toBe(false);
  });

  test("given no skipped entries, when checking, then returns false", () => {
    const ctx = makeCtx({ hasSkippedEntries: false });
    expect(shouldSummarize(ctx, null)).toBe(false);
  });

  test("given no lastKnownMemoryId, when checking, then returns false", () => {
    const ctx = makeCtx({ lastKnownMemoryId: null });
    expect(shouldSummarize(ctx, null)).toBe(false);
  });

  test("given fresh summary covering range, when checking, then returns false", () => {
    const ctx = makeCtx({ lastKnownMemoryId: 100 });
    const existing: ChatSummary = { kind: "summary", content: "...", coversUpTo: 100, timestamp: "" };
    expect(shouldSummarize(ctx, existing)).toBe(false);
  });

  test("given stale summary, when checking, then returns true", () => {
    const ctx = makeCtx({ lastKnownMemoryId: 200 });
    const existing: ChatSummary = { kind: "summary", content: "...", coversUpTo: 100, timestamp: "" };
    expect(shouldSummarize(ctx, existing)).toBe(true);
  });

  test("given zero available budget, when checking, then returns false", () => {
    const ctx = makeCtx({ budget: { ...makeCtx().budget, conversationTokens: 0, remaining: 0 } });
    expect(shouldSummarize(ctx, null)).toBe(false);
  });
});

describe("generateSummary — first summary", () => {
  test("given entries before lastKnownMemoryId, when generating, then summary is stored", async () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowids = populateChat(db, chat.id, 5);
    const lastKnownMemoryId = rowids[6];

    const agent = summaryAgent("This is a test summary.");
    await generateSummary(db, agent, chat.id, lastKnownMemoryId, noopLogger);

    const summary = db.getSummary(chat.id);
    expect(summary).not.toBeNull();
    expect(summary!.content).toBe("This is a test summary.");
    expect(summary!.coversUpTo).toBe(lastKnownMemoryId - 1);
  });

  test("given no entries before lastKnownMemoryId, when generating, then no summary stored", async () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowids = populateChat(db, chat.id, 2);
    const firstRowid = rowids[0];

    const agent = summaryAgent("Should not be stored");
    await generateSummary(db, agent, chat.id, firstRowid, noopLogger);

    expect(db.getSummary(chat.id)).toBeNull();
  });

  test("given agent returns empty text, when generating, then no summary stored", async () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowids = populateChat(db, chat.id, 5);

    const agent = summaryAgent("");
    await generateSummary(db, agent, chat.id, rowids[6], noopLogger);

    expect(db.getSummary(chat.id)).toBeNull();
  });
});

describe("generateSummary — incremental", () => {
  test("given existing summary and new entries, when generating, then summary is extended", async () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowids = populateChat(db, chat.id, 10);

    db.upsertSummary(chat.id, "Original summary of early messages.", rowids[5]);

    const agent = summaryAgent("Extended summary with new info.");
    await generateSummary(db, agent, chat.id, rowids[14], noopLogger);

    const summary = db.getSummary(chat.id);
    expect(summary).not.toBeNull();
    expect(summary!.content).toBe("Extended summary with new info.");
    expect(summary!.coversUpTo).toBe(rowids[14] - 1);
  });

  test("given existing summary already covers range, when generating, then no update", async () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowids = populateChat(db, chat.id, 5);

    db.upsertSummary(chat.id, "Already covers everything.", rowids[8]);

    const agent = summaryAgent("Should not replace");
    await generateSummary(db, agent, chat.id, rowids[8], noopLogger);

    const summary = db.getSummary(chat.id);
    expect(summary!.content).toBe("Already covers everything.");
  });

  test("given existing summary with no delta entries, when generating, then no update", async () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowids = populateChat(db, chat.id, 3);

    db.upsertSummary(chat.id, "Covers up to row 5.", rowids[4]);

    const agent = summaryAgent("Should not replace");
    await generateSummary(db, agent, chat.id, rowids[5], noopLogger);

    const summary = db.getSummary(chat.id);
    expect(summary!.content).toBe("Covers up to row 5.");
  });
});

describe("generateSummary — single summary invariant", () => {
  test("given multiple generate calls, then only one summary row exists", async () => {
    const db = setup();
    const chat = makeChat();
    db.createChat(chat);
    const rowids = populateChat(db, chat.id, 10);

    const agent1 = summaryAgent("First summary");
    await generateSummary(db, agent1, chat.id, rowids[6], noopLogger);

    const agent2 = summaryAgent("Second summary");
    await generateSummary(db, agent2, chat.id, rowids[14], noopLogger);

    const { entries } = db.getEntries(chat.id, 100);
    const summaries = entries.filter((e) => (e as any).kind === "summary");
    expect(summaries).toHaveLength(0);

    const summary = db.getSummary(chat.id);
    expect(summary).not.toBeNull();
    expect(summary!.content).toBe("Second summary");
  });
});
