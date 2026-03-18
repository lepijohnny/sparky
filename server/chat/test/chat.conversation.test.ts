import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { MockAgent, type MockScenario } from "../../core/adapters/agent.mock";
import type { Agent } from "../../core/agent.types";
import { createEventBus, type EventBus } from "../../core/bus";
import { createConfiguration } from "../../core/config";
import { createStorage } from "../../core/storage";
import { noopLogger } from "../../logger";
import { createChatWorkspace } from "../chat";
import { createNoopTrustStore } from "../../core/trust";
import type { ChatActivity, ChatEntry, ChatMessage } from "../chat.types";

const TEST_ROOT = join(tmpdir(), `sparky-chat-conv-test-${Date.now()}`);

// ── Inline test scenarios ────────────────────────────────────────────

const SIMPLE: MockScenario = {
  id: "test.simple",
  description: "Simple text response",
  rounds: [{
    events: [
      { delay: 10, event: { type: "text.delta", content: "The capital" } },
      { delay: 10, event: { type: "text.delta", content: " of France is **Paris**." } },
      { delay: 10, event: { type: "text.done", content: "The capital of France is **Paris**." } },
      { delay: 0,  event: { type: "done" } },
    ],
  }],
};

const WITH_TOOLS: MockScenario = {
  id: "test.tools",
  description: "Two tool calls then text",
  rounds: [{
    events: [
      { delay: 0, event: { type: "tool.start", id: "t1", name: "web_search", input: { query: "test" } } },
      { delay: 0, event: { type: "tool.result", id: "t1", output: "Search result" } },
      { delay: 0, event: { type: "tool.start", id: "t2", name: "create_file", input: { path: "/out.md" } } },
      { delay: 0, event: { type: "tool.result", id: "t2", output: "File written" } },
      { delay: 0, event: { type: "text.delta", content: "Done! Saved to `out.md`." } },
      { delay: 0, event: { type: "text.done", content: "Done! Saved to `out.md`." } },
      { delay: 0, event: { type: "done" } },
    ],
  }],
};

const MULTI_ROUND: MockScenario = {
  id: "test.multi-round",
  description: "Clarification then tool use",
  rounds: [
    {
      events: [
        { delay: 0, event: { type: "text.delta", content: "What topic should the report cover?" } },
        { delay: 0, event: { type: "text.done", content: "What topic should the report cover?" } },
        { delay: 0, event: { type: "done" } },
      ],
    },
    {
      events: [
        { delay: 0, event: { type: "tool.start", id: "t1", name: "web_search", input: { query: "TypeScript" } } },
        { delay: 0, event: { type: "tool.result", id: "t1", output: "TypeScript stats" } },
        { delay: 0, event: { type: "tool.start", id: "t2", name: "create_file", input: { path: "/report.md" } } },
        { delay: 0, event: { type: "tool.result", id: "t2", output: "File written" } },
        { delay: 0, event: { type: "text.delta", content: "Report saved to `report.md`." } },
        { delay: 0, event: { type: "text.done", content: "Report saved to `report.md`." } },
        { delay: 0, event: { type: "done" } },
      ],
    },
  ],
};

const WITH_ERROR: MockScenario = {
  id: "test.error",
  description: "Error mid-stream",
  rounds: [{
    events: [
      { delay: 0, event: { type: "text.delta", content: "Let me think..." } },
      { delay: 0, event: { type: "error", message: "Overloaded" } },
      { delay: 0, event: { type: "done" } },
    ],
  }],
};

// ── Helpers ───────────────────────────────────────────────────────────

function setup(agent?: Agent) {
  const bus = createEventBus(noopLogger);
  const storage = createStorage(noopLogger, TEST_ROOT).seed();
  const config = createConfiguration(storage);
  const wsPath = "workspaces/test-ws";
  storage.mkdir(wsPath);
  storage.write("config.json", {
    activeWorkspace: "ws-1",
    workspaces: [{ id: "ws-1", name: "Test", path: wsPath, createdAt: "2026-01-01" }],
  });
  const dbPath = storage.root(`${wsPath}/workspace.db`);
  const factory = agent ? () => ({ agent }) : undefined;
  const chatManager = createChatWorkspace(bus, config, noopLogger, dbPath, "", createNoopTrustStore(), factory);
  return { bus, config, chatManager };
}

function messages(entries: ChatEntry[]): ChatMessage[] {
  return entries.filter((e): e is ChatMessage => e.kind === "message");
}

function activities(entries: ChatEntry[]): ChatActivity[] {
  return entries.filter((e): e is ChatActivity => e.kind === "activity");
}

function activitiesOfType(entries: ChatEntry[], type: string): ChatActivity[] {
  return activities(entries).filter((a) => a.type === type);
}

function waitForDone(bus: EventBus): Promise<void> {
  return new Promise<void>((resolve) => {
    bus.subscribe("chat.event", (ev: any) => {
      if (ev.kind === "activity" && (ev.type === "agent.done" || ev.type === "agent.stopped")) {
        resolve();
      }
    });
  });
}

beforeEach(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });
afterAll(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });

// ── Tests ─────────────────────────────────────────────────────────────

describe("chat.ask — no agent", () => {
  test("given no agent, when asking, then user message is stored as kind=message", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Test" });
    const chatId = created!.chat.id;

    await bus.emit("chat.ask", { chatId, content: "Hello world" });
    await new Promise((r) => setTimeout(r, 10));

    const loaded = await bus.emit("chat.get.id", { id: chatId });
    const msgs = messages(loaded!.entries);
    expect(msgs.length).toBe(1);
    expect(msgs[0]).toMatchObject({ kind: "message", role: "user", content: "Hello world" });
  });
});

describe("chat.ask — simple agent", () => {
  test("given simple scenario, when asking, then user + assistant messages are stored", async () => {
    const { bus } = setup(new MockAgent(SIMPLE, 0));
    const done = waitForDone(bus);

    const created = await bus.emit("chat.create", { name: "Test" });
    const chatId = created!.chat.id;

    await bus.emit("chat.ask", { chatId, content: "What is the capital of France?" });
    await done;

    const loaded = await bus.emit("chat.get.id", { id: chatId });
    const msgs = messages(loaded!.entries);

    expect(msgs.length).toBe(2);
    expect(msgs[0]).toMatchObject({ role: "user" });
    expect(msgs[1]).toMatchObject({ role: "assistant" });
    expect(msgs[1].content).toContain("Paris");

    expect(activitiesOfType(loaded!.entries, "agent.text.delta").length).toBe(0);
    expect(activitiesOfType(loaded!.entries, "agent.done").length).toBe(1);
  });
});

describe("chat.ask — tools", () => {
  test("given tools scenario, when asking, then tool activities are stored", async () => {
    const { bus } = setup(new MockAgent(WITH_TOOLS, 0));
    const done = waitForDone(bus);

    const created = await bus.emit("chat.create", { name: "Test" });
    const chatId = created!.chat.id;

    await bus.emit("chat.ask", { chatId, content: "Search and save" });
    await done;

    const loaded = await bus.emit("chat.get.id", { id: chatId });

    expect(activitiesOfType(loaded!.entries, "agent.tool.start").length).toBe(2);
    expect(activitiesOfType(loaded!.entries, "agent.tool.start")[0].data?.name).toBe("web_search");
    expect(activitiesOfType(loaded!.entries, "agent.tool.start")[1].data?.name).toBe("create_file");
    expect(activitiesOfType(loaded!.entries, "agent.tool.result").length).toBe(2);

    const msgs = messages(loaded!.entries);
    const assistant = msgs.filter((m) => m.role === "assistant");
    expect(assistant.length).toBe(1);
    expect(assistant[0].content).toContain("out.md");
  });
});

describe("chat.ask — multi-round", () => {
  test("given multi-round scenario, when asking twice, then first round is clarification and second has tools", async () => {
    const { bus } = setup(new MockAgent(MULTI_ROUND, 0));

    const created = await bus.emit("chat.create", { name: "Test" });
    const chatId = created!.chat.id;

    let done = waitForDone(bus);
    await bus.emit("chat.ask", { chatId, content: "Can you create a report for me?" });
    await done;

    let loaded = await bus.emit("chat.get.id", { id: chatId });
    let msgs = messages(loaded!.entries);
    expect(msgs.length).toBe(2);
    expect(msgs[1].content).toContain("What topic");

    done = waitForDone(bus);
    await bus.emit("chat.ask", { chatId, content: "TypeScript adoption, markdown please." });
    await done;

    loaded = await bus.emit("chat.get.id", { id: chatId });
    msgs = messages(loaded!.entries);

    expect(msgs.length).toBe(4);
    expect(msgs[3].content).toContain("report.md");
    expect(activitiesOfType(loaded!.entries, "agent.tool.start").length).toBe(2);
  });
});

describe("chat.ask — error", () => {
  test("given error scenario, when asking, then error activity is stored and done activity emitted", async () => {
    const { bus } = setup(new MockAgent(WITH_ERROR, 0));
    const done = waitForDone(bus);

    const created = await bus.emit("chat.create", { name: "Test" });
    const chatId = created!.chat.id;

    await bus.emit("chat.ask", { chatId, content: "Do something" });
    await done;

    const loaded = await bus.emit("chat.get.id", { id: chatId });

    expect(activitiesOfType(loaded!.entries, "agent.text.delta").length).toBe(0);
    expect(activitiesOfType(loaded!.entries, "agent.error").length).toBe(1);
    expect(activitiesOfType(loaded!.entries, "agent.done").length).toBe(1);
  });
});

describe("chat.ask — broadcasting", () => {
  test("given chat:event subscriber, when asking with agent, then events are broadcast with chatId", async () => {
    const { bus } = setup(new MockAgent(SIMPLE, 0));

    const events: unknown[] = [];
    const done = new Promise<void>((resolve) => {
      bus.subscribe("chat.event", (data: any) => {
        events.push(data);
        if (data.kind === "activity" && (data.type === "agent.done" || data.type === "agent.error")) resolve();
      });
    });

    const created = await bus.emit("chat.create", { name: "Test" });
    const chatId = created!.chat.id;

    await bus.emit("chat.ask", { chatId, content: "Hi" });
    await done;

    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) {
      expect((ev as any).chatId).toBe(chatId);
    }

    expect(events[0]).toMatchObject({ chatId, kind: "message", role: "user", content: "Hi" });
  });
});

describe("chat.stop", () => {
  test("given streaming chat, when stopped, then stopped activity is written", async () => {
    const { bus } = setup(new MockAgent(SIMPLE, 1));
    const done = waitForDone(bus);

    const created = await bus.emit("chat.create", { name: "Test" });
    const chatId = created!.chat.id;

    await bus.emit("chat.ask", { chatId, content: "Hi" });

    await new Promise((r) => setTimeout(r, 20));
    const stopResult = await bus.emit("chat.stop", { chatId });
    expect(stopResult?.ok).toBe(true);

    await done;

    const loaded = await bus.emit("chat.get.id", { id: chatId });
    const stopped = activitiesOfType(loaded!.entries, "agent.stopped");
    expect(stopped.length).toBe(1);

    expect(activitiesOfType(loaded!.entries, "agent.done").length).toBe(0);
  });

  test("given no active chat, when stopping, then returns ok false", async () => {
    const { bus } = setup();
    const result = await bus.emit("chat.stop", { chatId: "nonexistent" });
    expect(result?.ok).toBe(false);
  });
});
