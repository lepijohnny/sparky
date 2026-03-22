import { describe, expect, test } from "vitest";
import { buildContext, contextBuilder, type EntryFetcher } from "../chat.context";
import type { AttachmentMeta, ChatEntry } from "../chat.types";

let rowidCounter = 1;

function userMsg(content: string, id?: string, attachments?: AttachmentMeta[]): ChatEntry {
  return { kind: "message", id: id ?? `u${rowidCounter}`, role: "user", content, timestamp: "2026-01-01T00:00:00Z", rowid: rowidCounter++, attachments };
}

function assistantMsg(content: string, id?: string): ChatEntry {
  return { kind: "message", id: id ?? `a${rowidCounter}`, role: "assistant", content, timestamp: "2026-01-01T00:00:01Z", rowid: rowidCounter++ };
}

function toolStart(name: string, messageId: string, toolId: string): ChatEntry {
  return { kind: "activity", messageId, source: "agent", type: "agent.tool.start", timestamp: "2026-01-01T00:00:01Z", data: { id: toolId, name, input: { query: "test" } }, rowid: rowidCounter++ };
}

function toolResult(messageId: string, toolId: string, output: string): ChatEntry {
  return { kind: "activity", messageId, source: "agent", type: "agent.tool.result", timestamp: "2026-01-01T00:00:02Z", data: { id: toolId, output }, rowid: rowidCounter++ };
}

const emptyFetcher: EntryFetcher = () => ({ entries: [], hasMore: false });

function arrayFetcher(entries: ChatEntry[]): EntryFetcher {
  return (pageSize: number, beforeRowid?: number) => {
    const messages = entries.filter((e) => e.kind === "message");
    const filtered = beforeRowid
      ? messages.filter((m) => (m.rowid ?? 0) < beforeRowid)
      : messages;

    const page = filtered.slice(-pageSize);
    const oldestRowid = page.length > 0 ? Math.min(...page.map((m) => m.rowid ?? 0)) : undefined;

    const messageIds = new Set(page.map((m) => m.id));
    const activities = entries.filter((e) => e.kind === "activity" && messageIds.has(e.messageId));
    const combined = [...page, ...activities].sort((a, b) => (a.rowid ?? 0) - (b.rowid ?? 0));

    const hasMore = oldestRowid !== undefined && filtered.length > page.length;
    return { entries: combined, hasMore };
  };
}

describe("buildContext", () => {
  test("given empty fetcher, when building context, then returns empty result", () => {
    const fetcher: EntryFetcher = () => ({ entries: [], hasMore: false });
    const result = buildContext(fetcher, 200_000, "System prompt");
    expect(result.messages).toEqual([]);
    expect(result.usedTokens).toBe(0);
    expect(result.includedTurns).toBe(0);
    expect(result.hasSkippedEntries).toBe(false);
  });

  test("given single user message, when building context, then includes one turn", () => {
    const entries = [userMsg("Hello")];
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[0].content).toBe("Hello");
    expect(result.includedTurns).toBe(1);
  });

  test("given user+assistant pair, when building context, then groups as one turn", () => {
    const entries = [userMsg("Hi"), assistantMsg("Hello!")];
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].role).toBe("user");
    expect(result.messages[1].role).toBe("assistant");
    expect(result.includedTurns).toBe(1);
  });

  test("given three exchanges, when building context, then includes three turns", () => {
    const entries = [
      userMsg("Q1"), assistantMsg("A1"),
      userMsg("Q2"), assistantMsg("A2"),
      userMsg("Q3"), assistantMsg("A3"),
    ];
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.includedTurns).toBe(3);
    expect(result.messages).toHaveLength(6);
  });

  test("given large messages and small budget, when building context, then drops oldest turns first", () => {
    const entries = [
      userMsg("A".repeat(40000)), assistantMsg("B".repeat(40000)),
      userMsg("C".repeat(40000)), assistantMsg("D".repeat(40000)),
      userMsg("Hello"), assistantMsg("World"),
    ];
    // Each big turn ≈ 20,000 tokens. contextWindow=16000 → available ≈ 11900.
    // Only the small turn fits within budget.
    const result = buildContext(arrayFetcher(entries), 16000, "Sys");
    expect(result.includedTurns).toBeLessThan(3);
    expect(result.messages.length).toBeGreaterThan(0);
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.content).toBe("World");
  });

  test("given tool calls in turn, when building context, then includes tool messages", () => {
    const msgId = "a1";
    const entries = [
      userMsg("Search for cats"),
      toolStart("search", msgId, "tc1"),
      toolResult(msgId, "tc1", "Found 5 cats"),
      assistantMsg("I found 5 cats", msgId),
    ];
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.includedTurns).toBe(1);
    const toolMsgs = result.messages.filter((m) => m.role === "tool");
    expect(toolMsgs).toHaveLength(1);
    const assistantMsgs = result.messages.filter((m) => m.role === "assistant");
    expect(assistantMsgs[0].toolCalls).toHaveLength(1);
    expect(assistantMsgs[0].toolCalls![0].name).toBe("search");
  });

  test("given multi-turn conversation, when building context, then preserves chronological order", () => {
    const entries = [
      userMsg("First"), assistantMsg("Second"),
      userMsg("Third"), assistantMsg("Fourth"),
    ];
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.messages.map((m) => m.content)).toEqual(["First", "Second", "Third", "Fourth"]);
  });

  test("given all turns fit in budget, when building context, then hasSkippedEntries is false", () => {
    const entries = [userMsg("Hi"), assistantMsg("Hello")];
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.hasSkippedEntries).toBe(false);
  });

  test("given non-empty conversation, when building context, then usedTokens is positive", () => {
    const entries = [userMsg("Hello world")];
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.usedTokens).toBeGreaterThan(0);
  });

  test("given long system prompt, when building context, then available budget is smaller", () => {
    const entries = [userMsg("test")];
    const r1 = buildContext(arrayFetcher(entries), 200_000, "Hi");
    const r2 = buildContext(arrayFetcher(entries), 200_000, "A".repeat(4000));
    expect(r2.budget.available).toBeLessThan(r1.budget.available);
  });

  test("given tools defined, when building context, then available budget is reduced", () => {
    const entries = [userMsg("test")];
    const tools = [{
      name: "search",
      description: "Search the web for information",
      parameters: { type: "object" as const, properties: { query: { type: "string", description: "Search query" } }, required: ["query"] },
    }];
    const r1 = buildContext(arrayFetcher(entries), 200_000, "System");
    const r2 = buildContext(arrayFetcher(entries), 200_000, "System", tools);
    expect(r2.budget.available).toBeLessThan(r1.budget.available);
  });

  test("given 60+ entries, when building context, then pagination fetches multiple pages", () => {
    const entries: ChatEntry[] = [];
    for (let i = 0; i < 60; i++) {
      entries.push(userMsg(`Q${i}`));
      entries.push(assistantMsg(`A${i}`));
    }
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.includedTurns).toBeGreaterThan(25);
  });

  test("given orphan assistant message, when building context, then includes it", () => {
    const entries = [assistantMsg("I'm here to help")];
    const result = buildContext(arrayFetcher(entries), 200_000, "System");
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].role).toBe("assistant");
  });
});

describe("contextBuilder — anchors", () => {
  test("given anchored entries, when building, then system prompt contains anchored-messages block", () => {
    const anchored: ChatEntry[] = [
      userMsg("Remember this fact"),
      assistantMsg("I will remember"),
    ];
    const ctx = contextBuilder(200_000)
      .system("You are helpful.")
      .anchors(anchored)
      .build();

    expect(ctx.system).toContain("<anchored-messages>");
    expect(ctx.system).toContain("</anchored-messages>");
    expect(ctx.system).toContain('<anchor role="user">');
    expect(ctx.system).toContain("Remember this fact");
    expect(ctx.system).toContain('<anchor role="assistant">');
    expect(ctx.system).toContain("I will remember");
  });

  test("given no anchored entries, when building, then system prompt has no anchored-messages", () => {
    const ctx = contextBuilder(200_000)
      .system("You are helpful.")
      .anchors([])
      .build();

    expect(ctx.system).not.toContain("<anchored-messages>");
  });

  test("given anchored entries, when building, then anchorTokens is positive", () => {
    const anchored: ChatEntry[] = [userMsg("Pin this")];
    const ctx = contextBuilder(200_000)
      .system("System")
      .anchors(anchored)
      .build();

    expect(ctx.budget.anchorTokens).toBeGreaterThan(0);
  });

  test("given anchored entries, when building, then remaining budget is reduced", () => {
    const fetcher = arrayFetcher([userMsg("Hello"), assistantMsg("Hi")]);
    const without = contextBuilder(200_000).system("Sys").conversation(fetcher).build();
    const with_ = contextBuilder(200_000).system("Sys").anchors([userMsg("Pinned")]).conversation(fetcher).build();

    expect(with_.budget.remaining).toBeLessThan(without.budget.remaining);
  });

  test("given anchors and knowledge, when building, then both appear in system prompt", () => {
    const anchored: ChatEntry[] = [userMsg("Important context")];
    const knowledge = [{ sourceFileName: "doc.md", content: "Some knowledge" }];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .anchors(anchored)
      .knowledge(knowledge)
      .build();

    expect(ctx.system).toContain("<anchored-messages>");
    expect(ctx.system).toContain("<context>");
    const anchorIdx = ctx.system.indexOf("<anchored-messages>");
    const knowledgeIdx = ctx.system.indexOf("<context>");
    expect(anchorIdx).toBeLessThan(knowledgeIdx);
  });

  test("given anchors and summary, when building, then both appear in correct order", () => {
    const anchored: ChatEntry[] = [userMsg("Important")];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .anchors(anchored)
      .summary("Earlier they discussed X.")
      .build();

    expect(ctx.system).toContain("<anchored-messages>");
    expect(ctx.system).toContain("<conversation-summary>");
    const anchorIdx = ctx.system.indexOf("<anchored-messages>");
    const summaryIdx = ctx.system.indexOf("<conversation-summary>");
    expect(anchorIdx).toBeLessThan(summaryIdx);
  });

  test("given only activity entries as anchors, when building, then no anchored-messages block", () => {
    const anchored: ChatEntry[] = [{
      kind: "activity", messageId: "t1", source: "agent", type: "agent.done",
      timestamp: "2026-01-01T00:00:00Z", rowid: rowidCounter++,
    }];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .anchors(anchored)
      .build();

    expect(ctx.system).not.toContain("<anchored-messages>");
    expect(ctx.budget.anchorTokens).toBe(0);
  });
});

describe("contextBuilder — summary", () => {
  test("given summary text, when building, then system prompt contains conversation-summary", () => {
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .summary("User discussed REST APIs and chose Express.")
      .build();

    expect(ctx.system).toContain("<conversation-summary>");
    expect(ctx.system).toContain("REST APIs");
    expect(ctx.system).toContain("</conversation-summary>");
  });

  test("given no summary, when building, then no conversation-summary block", () => {
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .summary("")
      .build();

    expect(ctx.system).not.toContain("<conversation-summary>");
  });

  test("given summary, when building, then summaryTokens is positive", () => {
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .summary("A brief summary of the conversation.")
      .build();

    expect(ctx.budget.summaryTokens).toBeGreaterThan(0);
  });

  test("given summary, when building, then remaining budget is reduced", () => {
    const fetcher = arrayFetcher([userMsg("Hello"), assistantMsg("Hi")]);
    const without = contextBuilder(200_000).system("Sys").conversation(fetcher).build();
    const with_ = contextBuilder(200_000).system("Sys").summary("Summary text here").conversation(fetcher).build();

    expect(with_.budget.remaining).toBeLessThan(without.budget.remaining);
  });

  test("given conversation, when building, then lastKnownMemoryId is set", () => {
    const entries = [userMsg("Q1"), assistantMsg("A1"), userMsg("Q2"), assistantMsg("A2")];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .conversation(arrayFetcher(entries))
      .build();

    expect(ctx.lastKnownMemoryId).not.toBeNull();
    expect(typeof ctx.lastKnownMemoryId).toBe("number");
  });

  test("given empty conversation, when building, then lastKnownMemoryId is null", () => {
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .conversation(arrayFetcher([]))
      .build();

    expect(ctx.lastKnownMemoryId).toBeNull();
  });

  test("given summary + knowledge, when building, then summary appears before context", () => {
    const knowledge = [{ sourceFileName: "doc.md", content: "Some knowledge" }];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .summary("Earlier discussion summary")
      .knowledge(knowledge)
      .build();

    const summaryIdx = ctx.system.indexOf("<conversation-summary>");
    const contextIdx = ctx.system.indexOf("<context>");
    expect(summaryIdx).toBeLessThan(contextIdx);
  });
});

describe("contextBuilder — attachments", () => {
  test("given user message with attachments, when building, then annotates content with filenames", () => {
    const entries = [
      userMsg("What's in this image?", undefined, [{ id: "att-1", filename: "photo.png", mimeType: "image/png", size: 1000 }]),
      assistantMsg("I see a cat."),
    ];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .conversation(arrayFetcher(entries))
      .build();

    const userContent = ctx.messages[0].content;
    expect(userContent).toContain("What's in this image?");
    expect(userContent).toContain("[attached: photo.png (image/png)]");
  });

  test("given user message with multiple attachments, when building, then annotates all", () => {
    const entries = [
      userMsg("Compare these", undefined, [
        { id: "att-1", filename: "a.jpg", mimeType: "image/jpeg", size: 1000 },
        { id: "att-1", filename: "b.pdf", mimeType: "application/pdf", size: 1000 },
      ]),
      assistantMsg("They differ."),
    ];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .conversation(arrayFetcher(entries))
      .build();

    const userContent = ctx.messages[0].content as string;
    expect(userContent).toContain("[attached: a.jpg (image/jpeg)]");
    expect(userContent).toContain("[attached: b.pdf (application/pdf)]");
  });

  test("given user message without attachments, when building, then content is unchanged", () => {
    const entries = [userMsg("Hello"), assistantMsg("Hi")];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .conversation(arrayFetcher(entries))
      .build();

    expect(ctx.messages[0].content).toBe("Hello");
  });

  test("given user message with empty attachments array, when building, then content is unchanged", () => {
    const entries = [userMsg("Hello", undefined, []), assistantMsg("Hi")];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .conversation(arrayFetcher(entries))
      .build();

    expect(ctx.messages[0].content).toBe("Hello");
  });

  test("given mixed turns with and without attachments, when building, then only annotated turns have tags", () => {
    const entries = [
      userMsg("First question"),
      assistantMsg("First answer"),
      userMsg("Look at this", undefined, [{ id: "att-1", filename: "chart.png", mimeType: "image/png", size: 1000 }]),
      assistantMsg("Nice chart"),
      userMsg("Follow up"),
      assistantMsg("Sure"),
    ];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .conversation(arrayFetcher(entries))
      .build();

    const userMessages = ctx.messages.filter((m) => m.role === "user");
    expect(userMessages[0].content).toBe("First question");
    expect(userMessages[1].content).toContain("[attached: chart.png");
    expect(userMessages[2].content).toBe("Follow up");
  });

  test("given attachment annotation, when building, then annotation does not contain file data", () => {
    const entries = [
      userMsg("Analyze", undefined, [{ id: "att-1", filename: "big.png", mimeType: "image/png", size: 1000 }]),
      assistantMsg("Done"),
    ];
    const ctx = contextBuilder(200_000)
      .system("Sys")
      .conversation(arrayFetcher(entries))
      .build();

    const userContent = ctx.messages[0].content as string;
    expect(userContent).not.toContain("base64");
    expect(userContent).not.toContain("filePath");
    expect(userContent.length).toBeLessThan(200);
  });

  test("given skills summaries, when building context, then injects active-skills block", () => {
    const ctx = contextBuilder()
      .system("You are helpful.")
      .skills([
        { id: "code-reviewer", name: "Code Reviewer", description: "Reviews code" },
        { id: "translator", name: "Translator", description: "Translates text" },
      ])
      .conversation(emptyFetcher)
      .build();

    expect(ctx.system).toContain("<active-skills>");
    expect(ctx.system).toContain("Code Reviewer");
    expect(ctx.system).toContain("Translator");
    expect(ctx.system).toContain("app_read");
    expect(ctx.budget.skillsTokens).toBeGreaterThan(0);
  });

  test("given empty skills, when building context, then no skills block", () => {
    const ctx = contextBuilder()
      .system("You are helpful.")
      .skills([])
      .conversation(emptyFetcher)
      .build();

    expect(ctx.system).not.toContain("<active-skills>");
    expect(ctx.budget.skillsTokens).toBe(0);
  });
});
