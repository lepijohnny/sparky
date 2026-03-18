import { afterAll, beforeEach, describe, expect, test } from "vitest";
import { readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createChatWorkspace } from "../../chat/chat";
import { createNoopTrustStore } from "../../core/trust";
import type { ChatActivity, ChatEntry, ChatMessage } from "../../chat/chat.types";
import { MockAgent, type MockScenario } from "../../core/adapters/agent.mock";
import type { Agent } from "../../core/agent.types";
import { createEventBus } from "../../core/bus";
import { createConfiguration } from "../../core/config";
import { createStorage } from "../../core/storage";
import { noopLogger } from "../../logger";

const TEST_ROOT = join(tmpdir(), `sparky-recordings-test-${Date.now()}`);
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
const SCENARIOS = join(dirname(fileURLToPath(import.meta.url)), "scenarios");

const AGENT_EVENT_MAP: Record<string, string> = {
  "text.delta": "agent.text.delta",
  "text.done": "assistant_message",
  "thinking.start": "agent.thinking.start",
  "thinking.delta": "agent.thinking.delta",
  "thinking.done": "agent.thinking.done",
  "tool.start": "agent.tool.start",
  "tool.result": "agent.tool.result",
  "tool.denied": "agent.tool.denied",
  "server_tool.start": "agent.tool.start",
  "error": "agent.error",
};

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
  return { bus, chatManager };
}

function messages(entries: ChatEntry[]): ChatMessage[] {
  return entries.filter((e): e is ChatMessage => e.kind === "message");
}

function activities(entries: ChatEntry[]): ChatActivity[] {
  return entries.filter((e): e is ChatActivity => e.kind === "activity");
}

function loadScenario(name: string): MockScenario {
  return require(join(SCENARIOS, name));
}

function expectedBroadcasts(scenario: MockScenario): string[] {
  const expected: string[] = ["user_message", "agent.start"];

  for (const event of scenario.rounds[0].events) {
    const mapped = AGENT_EVENT_MAP[event.event.type];
    if (mapped) expected.push(mapped);
  }

  expected.push("agent.done");
  return expected;
}

beforeEach(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });
afterAll(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });

const scenarios = readdirSync(SCENARIOS).filter((f) => f.endsWith(".json"));

describe("scenario replay", () => {
  for (const file of scenarios) {
    const scenario = loadScenario(file);
    const expected = expectedBroadcasts(scenario);

    describe(file, () => {
      test("given recording, when replayed through conversation, then all expected events are broadcast in order", async () => {
        const { bus } = setup(new MockAgent(scenario, 0));

        const broadcasts: string[] = [];
        const done = new Promise<void>((resolve) => {
          bus.subscribe("chat.event", (ev: any) => {
            if (ev.kind === "message" && ev.role === "user") {
              broadcasts.push("user_message");
            } else if (ev.kind === "message" && ev.role === "assistant") {
              broadcasts.push("assistant_message");
            } else if (ev.kind === "activity") {
              broadcasts.push(ev.type);
              if (ev.type === "agent.done" || ev.type === "agent.error") resolve();
            }
          });
        });

        const prompt = scenario.prompt ?? "test input";
        const created = await bus.emit("chat.create", { name: "Test" });
        const chatId = created!.chat.id;
        await bus.emit("chat.ask", { chatId, content: prompt });
        await done;

        expect(broadcasts).toEqual(expected);
      });

      test("given recording, when replayed, then persisted entries match non-ephemeral events", async () => {
        const { bus } = setup(new MockAgent(scenario, 0));

        const done = new Promise<void>((resolve) => {
          bus.subscribe("chat.event", (ev: any) => {
            if (ev.kind === "activity" && (ev.type === "agent.done" || ev.type === "agent.error")) resolve();
          });
        });

        const prompt = scenario.prompt ?? "test input";
        const created = await bus.emit("chat.create", { name: "Test" });
        const chatId = created!.chat.id;
        await bus.emit("chat.ask", { chatId, content: prompt });
        await done;

        const loaded = await bus.emit("chat.get.id", { id: chatId });
        const entries = loaded!.entries;
        const msgs = messages(entries);
        const acts = activities(entries);

        expect(msgs[0]).toMatchObject({ role: "user", content: prompt });

        const hasTextDone = scenario.rounds[0].events.some((e) => e.event.type === "text.done");
        if (hasTextDone) {
          const textDone = scenario.rounds[0].events.find((e) => e.event.type === "text.done")!;
          const assistantMsg = msgs.find((m) => m.role === "assistant");
          expect(assistantMsg).toBeDefined();
          expect(assistantMsg!.content).toBe((textDone.event as any).content);
        }

        const ephemeralTypes = new Set(["agent.text.delta", "agent.thinking.delta"]);
        const persistedEphemeral = acts.filter((a) => ephemeralTypes.has(a.type));
        expect(persistedEphemeral).toEqual([]);

        expect(acts.some((a) => a.type === "agent.done")).toBe(true);

        const hasThinking = scenario.rounds[0].events.some((e) => e.event.type === "thinking.start");
        if (hasThinking) {
          expect(acts.some((a) => a.type === "agent.thinking.start")).toBe(true);
        }

        const hasTools = scenario.rounds[0].events.some((e) => e.event.type === "tool.start");
        if (hasTools) {
          const toolStarts = scenario.rounds[0].events.filter((e) => e.event.type === "tool.start");
          const persistedToolStarts = acts.filter((a) => a.type === "agent.tool.start");
          expect(persistedToolStarts.length).toBe(toolStarts.length);

          for (let i = 0; i < toolStarts.length; i++) {
            const recorded = (toolStarts[i].event as any);
            expect(persistedToolStarts[i].data?.name).toBe(recorded.name);
          }
        }

        const hasError = scenario.rounds[0].events.some((e) => e.event.type === "error");
        if (hasError) {
          expect(acts.some((a) => a.type === "agent.error")).toBe(true);
        }
      });

      test("given recording, when replayed, then all entries share the same turnId", async () => {
        const { bus } = setup(new MockAgent(scenario, 0));

        const done = new Promise<void>((resolve) => {
          bus.subscribe("chat.event", (ev: any) => {
            if (ev.kind === "activity" && (ev.type === "agent.done" || ev.type === "agent.error")) resolve();
          });
        });

        const prompt = scenario.prompt ?? "test input";
        const created = await bus.emit("chat.create", { name: "Test" });
        const chatId = created!.chat.id;
        await bus.emit("chat.ask", { chatId, content: prompt });
        await done;

        const loaded = await bus.emit("chat.get.id", { id: chatId });
        const userMsg = messages(loaded!.entries).find((m) => m.role === "user");
        const turnId = userMsg!.id;

        const assistantMsg = messages(loaded!.entries).find((m) => m.role === "assistant");
        if (assistantMsg) {
          expect(assistantMsg.id).toBe(turnId);
        }

        for (const act of activities(loaded!.entries)) {
          expect(act.messageId).toBe(turnId);
        }
      });
    });
  }
});
