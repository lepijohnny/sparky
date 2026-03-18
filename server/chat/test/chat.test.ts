import { describe, expect, test, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Agent, AgentEvent, AgentTurn } from "../../core/agent.types";
import { createEventBus, type EventBus } from "../../core/bus";
import { createConfiguration, type Configuration } from "../../core/config";
import { createStorage } from "../../core/storage";
import { createChatWorkspace, type ChatWorkspace } from "../chat";
import { createNoopTrustStore } from "../../core/trust";

const noop = { info() {}, warn() {}, error() {}, debug() {} } as any;

function makeAgent(events: AgentEvent[]): Agent {
  return {
    async *stream() {
      for (const e of events) yield e;
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("ChatManager", () => {
  let tmpDir: string;
  let bus: EventBus;
  let config: Configuration;
  let manager: ChatWorkspace;
  let agentEvents: AgentEvent[];

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "chat-mgr-test-"));
    bus = createEventBus(noop);
    const storage = createStorage(noop, tmpDir).seed();
    config = createConfiguration(storage);

    agentEvents = [
      { type: "text.delta", content: "Hello" },
      { type: "text.done", content: "Hello world" },
      { type: "done" },
    ];

    manager = createChatWorkspace(bus, config, noop, join(tmpDir, "test.db"), "", createNoopTrustStore(), async () => ({
      agent: makeAgent(agentEvents),
      contextWindow: 200_000,
    }));
  });

  afterEach(() => {
    manager.dispose();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("given new chat data, when creating, then returns chat with name", async () => {
    const created = await bus.emit("chat.create", { name: "Test Chat" });
    expect(created).toBeDefined();
    expect(created.chat.name).toBe("Test Chat");
  });

  test("given created chat, when listing, then includes the chat", async () => {
    await bus.emit("chat.create", { name: "Listed Chat" });
    const list = await bus.emit("chat.list");
    expect(list.chats.length).toBeGreaterThanOrEqual(1);
  });

  test("given existing chat, when getting by id, then returns chat with entries", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Lookup" });
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found).toBeDefined();
    expect(found!.chat.name).toBe("Lookup");
    expect(found!.entries).toBeDefined();
  });

  test("given non-existent id, when getting chat, then returns null", async () => {
    const found = await bus.emit("chat.get.id", { id: "nonexistent" });
    expect(found).toBeNull();
  });

  test("given existing chat, when renaming, then name is updated", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Old" });
    await bus.emit("chat.rename", { id: chat.id, name: "New" });
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found!.chat.name).toBe("New");
  });

  test("given existing chat, when deleting, then get returns null", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Delete Me" });
    await bus.emit("chat.delete", { id: chat.id });
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found).toBeNull();
  });

  test("given existing chat, when flagging, then flagged is true", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Flag Test" });
    await bus.emit("chat.flag", { id: chat.id, flagged: true });
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found!.chat.flagged).toBe(true);
  });

  test("given flagged chat, when unflagging, then flagged is false", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Unflag Test" });
    await bus.emit("chat.flag", { id: chat.id, flagged: true });
    await bus.emit("chat.flag", { id: chat.id, flagged: false });
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found!.chat.flagged).toBe(false);
  });

  test("given existing chat, when archiving, then archived is true", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Archive Test" });
    await bus.emit("chat.archive", { id: chat.id, archived: true });
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found!.chat.archived).toBe(true);
  });

  test("given archived chat, when unarchiving, then archived is false", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Unarchive Test" });
    await bus.emit("chat.archive", { id: chat.id, archived: true });
    await bus.emit("chat.archive", { id: chat.id, archived: false });
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found!.chat.archived).toBe(false);
  });

  test("given chat and agent, when asking, then stores user and assistant messages", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Ask Test" });

    const events: any[] = [];
    bus.subscribe("chat.event", (data: any) => { events.push(data); });

    await bus.emit("chat.ask", { chatId: chat.id, content: "Hi there" });
    await delay(500);

    const userMsgs = events.filter((e) => e.kind === "message" && e.role === "user");
    expect(userMsgs).toHaveLength(1);
    expect(userMsgs[0].content).toBe("Hi there");

    const assistantMsgs = events.filter((e) => e.kind === "message" && e.role === "assistant");
    expect(assistantMsgs).toHaveLength(1);
    expect(assistantMsgs[0].content).toBe("Hello world");
  });

  test("given chat and agent, when asking, then emits agent.start and agent.done", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Activity Test" });

    const events: any[] = [];
    bus.subscribe("chat.event", (data: any) => { events.push(data); });

    await bus.emit("chat.ask", { chatId: chat.id, content: "Go" });
    await delay(500);

    const types = events.filter((e) => e.kind === "activity").map((e) => e.type);
    expect(types).toContain("agent.start");
    expect(types).toContain("agent.done");
  });

  test("given two created chats, when getting counts, then all is at least 2", async () => {
    await bus.emit("chat.create", { name: "Chat 1" });
    await bus.emit("chat.create", { name: "Chat 2" });

    const counts = await bus.emit("chat.counts");
    expect(counts.chats).toBeGreaterThanOrEqual(2);
  });

  test("given chat with user message, when asking, then emits chat.updated", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Update Test" });

    let updatedChat: any = null;
    bus.subscribe("chat.updated", (data: any) => { updatedChat = data.chat; });

    await bus.emit("chat.ask", { chatId: chat.id, content: "Trigger update" });
    await delay(500);

    expect(updatedChat).not.toBeNull();
    expect(updatedChat.id).toBe(chat.id);
  });

  test("given chat after ask, when getting entries, then messages are stored", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Entries Test" });

    await bus.emit("chat.ask", { chatId: chat.id, content: "Store me" });
    await delay(500);

    const { entries } = await bus.emit("chat.entries", { chatId: chat.id });
    const messages = entries.filter((e: any) => e.kind === "message");
    expect(messages.length).toBeGreaterThanOrEqual(1);
  });

  test("given existing chat, when labeling, then labels are set", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Label Test" });
    await bus.emit("chat.label", { id: chat.id, labels: ["lbl-1"] });
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found!.chat.labels).toContain("lbl-1");
  });

  test("given labeled chat, when removing label, then label is cleared", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Remove Label" });
    await bus.emit("chat.label", { id: chat.id, labels: ["lbl-2"] });
    manager.removeLabel("lbl-2");
    const found = await bus.emit("chat.get.id", { id: chat.id });
    expect(found!.chat.labels ?? []).not.toContain("lbl-2");
  });

  test("given created chat, when searching by name, then finds it", async () => {
    await bus.emit("chat.create", { name: "Unique Searchable Name" });
    const result = await bus.emit("chat.search", { query: "Unique Searchable" });
    expect(result.results.length).toBeGreaterThanOrEqual(1);
  });

  test("given flagged chat, when listing flagged, then includes it", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Flagged" });
    await bus.emit("chat.flag", { id: chat.id, flagged: true });
    const result = await bus.emit("chat.list.flagged");
    expect(result.chats.some((c: any) => c.id === chat.id)).toBe(true);
  });

  test("given archived chat, when listing archived, then includes it", async () => {
    const { chat } = await bus.emit("chat.create", { name: "Archived" });
    await bus.emit("chat.archive", { id: chat.id, archived: true });
    const result = await bus.emit("chat.list.archived");
    expect(result.chats.some((c: any) => c.id === chat.id)).toBe(true);
  });
});
