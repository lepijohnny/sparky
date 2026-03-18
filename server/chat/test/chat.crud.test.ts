import { describe, test, expect, beforeEach, afterAll } from "vitest";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createStorage } from "../../core/storage";
import { createConfiguration } from "../../core/config";
import { createChatWorkspace } from "../chat";
import { createNoopTrustStore } from "../../core/trust";
import { createEventBus } from "../../core/bus";
import { noopLogger } from "../../logger";

const TEST_ROOT = join(tmpdir(), `sparky-chat-crud-test-${Date.now()}`);

function setup() {
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
  const chatManager = createChatWorkspace(bus, config, noopLogger, dbPath, "", createNoopTrustStore());
  return { bus, storage, config, chatManager };
}

beforeEach(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });
afterAll(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });

describe("chat.create", () => {
  test("given active workspace, when creating a chat, then returns chat with id and name", async () => {
    const { bus } = setup();
    const result = await bus.emit("chat.create", { name: "My Chat" });
    expect(result?.chat.name).toBe("My Chat");
    expect(result?.chat.id).toBeDefined();
  });

  test("given no name, when creating a chat, then uses default name", async () => {
    const { bus } = setup();
    const result = await bus.emit("chat.create", {});
    expect(result?.chat.name).toBe("New Chat");
  });

  test("given create, then chat:created is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("chat.created", (data: unknown) => { events.push(data); });

    await bus.emit("chat.create", { name: "Test" });

    expect(events.length).toBe(1);
    expect((events[0] as any).chat.name).toBe("Test");
  });
});

describe("chat.list", () => {
  test("given no chats, when listing, then returns empty array", async () => {
    const { bus } = setup();
    const result = await bus.emit("chat.list");
    expect(result?.chats).toEqual([]);
  });

  test("given created chats, when listing, then returns all chats sorted by updatedAt desc", async () => {
    const { bus } = setup();
    await bus.emit("chat.create", { name: "First" });
    await new Promise((r) => setTimeout(r, 10));
    await bus.emit("chat.create", { name: "Second" });
    const result = await bus.emit("chat.list");
    expect(result?.chats.length).toBe(2);
    expect(result?.chats[0].name).toBe("Second");
    expect(result?.chats[1].name).toBe("First");
  });

  test("chat.list excludes archived chats", async () => {
    const { bus } = setup();
    await bus.emit("chat.create", { name: "Active" });
    const archived = await bus.emit("chat.create", { name: "Archived" });
    await bus.emit("chat.archive", { id: archived!.chat.id, archived: true });

    const result = await bus.emit("chat.list");
    expect(result?.chats.length).toBe(1);
    expect(result?.chats[0].name).toBe("Active");
  });
});

describe("chat.list.flagged", () => {
  test("returns only flagged non-archived chats", async () => {
    const { bus } = setup();
    await bus.emit("chat.create", { name: "Normal" });
    const b = await bus.emit("chat.create", { name: "Flagged" });
    const c = await bus.emit("chat.create", { name: "Flagged+Archived" });

    await bus.emit("chat.flag", { id: b!.chat.id, flagged: true });
    await bus.emit("chat.flag", { id: c!.chat.id, flagged: true });
    await bus.emit("chat.archive", { id: c!.chat.id, archived: true });

    const result = await bus.emit("chat.list.flagged");
    expect(result?.chats.length).toBe(1);
    expect(result?.chats[0].name).toBe("Flagged");
  });
});

describe("chat.list.archived", () => {
  test("returns only archived chats", async () => {
    const { bus } = setup();
    await bus.emit("chat.create", { name: "Active" });
    const archived = await bus.emit("chat.create", { name: "Archived" });
    await bus.emit("chat.archive", { id: archived!.chat.id, archived: true });

    const result = await bus.emit("chat.list.archived");
    expect(result?.chats.length).toBe(1);
    expect(result?.chats[0].name).toBe("Archived");
  });
});

describe("chat.delete", () => {
  test("given existing chat, when deleting, then chat is removed", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "To Delete" });
    const id = created!.chat.id;

    const deleteResult = await bus.emit("chat.delete", { id });
    expect(deleteResult?.deleted).toBe(true);

    const list = await bus.emit("chat.list");
    expect(list?.chats.length).toBe(0);
  });

  test("given non-existent chat, when deleting, then returns false", async () => {
    const { bus } = setup();
    const result = await bus.emit("chat.delete", { id: "nope" });
    expect(result?.deleted).toBe(false);
  });

  test("given delete, then chat:deleted is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("chat.deleted", (data: unknown) => { events.push(data); });

    const created = await bus.emit("chat.create", { name: "Test" });
    await bus.emit("chat.delete", { id: created!.chat.id });

    expect(events.length).toBe(1);
    expect((events[0] as any).id).toBe(created!.chat.id);
  });
});

describe("chat.get.id", () => {
  test("given chat with no messages, when selecting, then returns empty entries", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Empty" });
    const result = await bus.emit("chat.get.id", { id: created!.chat.id });
    expect(result?.chat.name).toBe("Empty");
    expect(result?.entries).toEqual([]);
  });

  test("given non-existent chat id, when selecting, then returns null", async () => {
    const { bus } = setup();
    const result = await bus.emit("chat.get.id", { id: "does-not-exist" });
    expect(result).toBeNull();
  });

  // Note: "no active workspace" test removed — DB is created at fixed path in tests
});

describe("chat.rename", () => {
  test("given existing chat, when renaming, then name is updated", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Old Name" });
    const id = created!.chat.id;

    const result = await bus.emit("chat.rename", { id, name: "New Name" });
    expect(result?.chat.name).toBe("New Name");

    const loaded = await bus.emit("chat.get.id", { id });
    expect(loaded?.chat.name).toBe("New Name");
  });

  test("given rename, then chat:updated is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("chat.updated", (data: unknown) => { events.push(data); });

    const created = await bus.emit("chat.create", { name: "Test" });
    await bus.emit("chat.rename", { id: created!.chat.id, name: "Renamed" });

    expect(events.length).toBe(1);
    expect((events[0] as any).chat.name).toBe("Renamed");
  });
});

describe("chat.flag", () => {
  test("given existing chat, when flagging, then flagged is true", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Test" });
    const id = created!.chat.id;

    const result = await bus.emit("chat.flag", { id, flagged: true });
    expect(result?.chat.flagged).toBe(true);

    const loaded = await bus.emit("chat.get.id", { id });
    expect(loaded?.chat.flagged).toBe(true);
  });

  test("given flagged chat, when unflagging, then flagged is false", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Test" });
    const id = created!.chat.id;

    await bus.emit("chat.flag", { id, flagged: true });
    const result = await bus.emit("chat.flag", { id, flagged: false });
    expect(result?.chat.flagged).toBe(false);
  });

  test("given flag, then chat:updated is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("chat.updated", (data: unknown) => { events.push(data); });

    const created = await bus.emit("chat.create", { name: "Test" });
    await bus.emit("chat.flag", { id: created!.chat.id, flagged: true });

    expect(events.length).toBe(1);
    expect((events[0] as any).chat.flagged).toBe(true);
  });
});

describe("chat.archive", () => {
  test("given existing chat, when archiving, then archived is true", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Test" });
    const id = created!.chat.id;

    const result = await bus.emit("chat.archive", { id, archived: true });
    expect(result?.chat.archived).toBe(true);

    const loaded = await bus.emit("chat.get.id", { id });
    expect(loaded?.chat.archived).toBe(true);
  });

  test("given archived chat, when unarchiving, then archived is false", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Test" });
    const id = created!.chat.id;

    await bus.emit("chat.archive", { id, archived: true });
    const result = await bus.emit("chat.archive", { id, archived: false });
    expect(result?.chat.archived).toBe(false);
  });

  test("given archive, then chat:updated is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("chat.updated", (data: unknown) => { events.push(data); });

    const created = await bus.emit("chat.create", { name: "Test" });
    await bus.emit("chat.archive", { id: created!.chat.id, archived: true });

    expect(events.length).toBe(1);
    expect((events[0] as any).chat.archived).toBe(true);
  });
});

describe("chat.label", () => {
  test("given existing chat, when labeling, then labels are set", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Test" });
    const id = created!.chat.id;

    const result = await bus.emit("chat.label", { id, labels: ["label-1", "label-2"] });
    expect(result?.chat.labels).toEqual(["label-1", "label-2"]);

    const loaded = await bus.emit("chat.get.id", { id });
    expect(loaded?.chat.labels).toEqual(["label-1", "label-2"]);
  });

  test("given labeled chat, when setting empty labels, then labels are removed", async () => {
    const { bus } = setup();
    const created = await bus.emit("chat.create", { name: "Test" });
    const id = created!.chat.id;

    await bus.emit("chat.label", { id, labels: ["label-1"] });
    const result = await bus.emit("chat.label", { id, labels: [] });
    expect(result?.chat.labels).toBeUndefined();
  });

  test("given label, then chat:updated is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("chat.updated", (data: unknown) => { events.push(data); });

    const created = await bus.emit("chat.create", { name: "Test" });
    await bus.emit("chat.label", { id: created!.chat.id, labels: ["label-1"] });

    expect(events.length).toBe(1);
    expect((events[0] as any).chat.labels).toEqual(["label-1"]);
  });
});

describe("chat.list.labeled", () => {
  test("given chats with labels, when listing by label, then returns matching chats", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "A" });
    const b = await bus.emit("chat.create", { name: "B" });
    await bus.emit("chat.create", { name: "C" });

    await bus.emit("chat.label", { id: a!.chat.id, labels: ["bug"] });
    await bus.emit("chat.label", { id: b!.chat.id, labels: ["bug", "feature"] });

    const result = await bus.emit("chat.list.labeled", { labelId: "bug" });
    expect(result?.chats.length).toBe(2);
  });

  test("given archived chat with label, when listing by label, then excludes archived", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "Active" });
    const b = await bus.emit("chat.create", { name: "Archived" });

    await bus.emit("chat.label", { id: a!.chat.id, labels: ["bug"] });
    await bus.emit("chat.label", { id: b!.chat.id, labels: ["bug"] });
    await bus.emit("chat.archive", { id: b!.chat.id, archived: true });

    const result = await bus.emit("chat.list.labeled", { labelId: "bug" });
    expect(result?.chats.length).toBe(1);
    expect(result?.chats[0].name).toBe("Active");
  });

  test("given no matching chats, when listing by label, then returns empty array", async () => {
    const { bus } = setup();
    await bus.emit("chat.create", { name: "A" });

    const result = await bus.emit("chat.list.labeled", { labelId: "nonexistent" });
    expect(result?.chats).toEqual([]);
  });

  test("given no labelId, when listing labeled, then returns all chats with any label", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "Labeled1" });
    const b = await bus.emit("chat.create", { name: "Labeled2" });
    await bus.emit("chat.create", { name: "NoLabel" });

    await bus.emit("chat.label", { id: a!.chat.id, labels: ["bug"] });
    await bus.emit("chat.label", { id: b!.chat.id, labels: ["feature"] });

    const result = await bus.emit("chat.list.labeled", {} as any);
    expect(result?.chats.length).toBe(2);
    const names = result?.chats.map((c: any) => c.name).sort();
    expect(names).toEqual(["Labeled1", "Labeled2"]);
  });

  test("given empty string labelId, when listing labeled, then returns all chats with any label", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "Labeled" });
    await bus.emit("chat.create", { name: "NoLabel" });

    await bus.emit("chat.label", { id: a!.chat.id, labels: ["bug"] });

    const result = await bus.emit("chat.list.labeled", { labelId: "" } as any);
    expect(result?.chats.length).toBe(1);
    expect(result?.chats[0].name).toBe("Labeled");
  });
});

describe("chat.counts", () => {
  test("given no chats, when counting, then all counts are zero", async () => {
    const { bus } = setup();
    const result = await bus.emit("chat.counts");
    expect(result).toEqual({ chats: 0, flagged: 0, archived: 0, labeled: 0, labels: {} });
  });

  test("given active chats, when counting, then chats count is correct", async () => {
    const { bus } = setup();
    await bus.emit("chat.create", { name: "A" });
    await bus.emit("chat.create", { name: "B" });
    const result = await bus.emit("chat.counts");
    expect(result?.chats).toBe(2);
    expect(result?.flagged).toBe(0);
    expect(result?.archived).toBe(0);
  });

  test("given flagged chats, when counting, then flagged count is correct", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "A" });
    await bus.emit("chat.create", { name: "B" });
    await bus.emit("chat.flag", { id: a!.chat.id, flagged: true });
    const result = await bus.emit("chat.counts");
    expect(result?.chats).toBe(2);
    expect(result?.flagged).toBe(1);
  });

  test("given archived chats, when counting, then archived excluded from chats count", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "A" });
    await bus.emit("chat.create", { name: "B" });
    await bus.emit("chat.archive", { id: a!.chat.id, archived: true });
    const result = await bus.emit("chat.counts");
    expect(result?.chats).toBe(1);
    expect(result?.archived).toBe(1);
  });

  test("given archived flagged chat, when counting, then not counted in flagged", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "A" });
    await bus.emit("chat.flag", { id: a!.chat.id, flagged: true });
    await bus.emit("chat.archive", { id: a!.chat.id, archived: true });
    const result = await bus.emit("chat.counts");
    expect(result?.chats).toBe(0);
    expect(result?.flagged).toBe(0);
    expect(result?.archived).toBe(1);
  });

  test("given labeled chats, when counting, then labeled and per-label counts are correct", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "A" });
    const b = await bus.emit("chat.create", { name: "B" });
    await bus.emit("chat.create", { name: "C" });

    await bus.emit("chat.label", { id: a!.chat.id, labels: ["bug", "feature"] });
    await bus.emit("chat.label", { id: b!.chat.id, labels: ["bug"] });

    const result = await bus.emit("chat.counts");
    expect(result?.labeled).toBe(2);
    expect(result?.labels).toEqual({ bug: 2, feature: 1 });
  });

  test("given archived labeled chat, when counting, then not counted in labeled", async () => {
    const { bus } = setup();
    const a = await bus.emit("chat.create", { name: "A" });
    await bus.emit("chat.label", { id: a!.chat.id, labels: ["bug"] });
    await bus.emit("chat.archive", { id: a!.chat.id, archived: true });

    const result = await bus.emit("chat.counts");
    expect(result?.labeled).toBe(0);
    expect(result?.labels).toEqual({});
  });
});

describe("removeLabel (cascade)", () => {
  test("given chats with label, when stripping, then only that label is removed", async () => {
    const { bus, chatManager } = setup();

    const a = await bus.emit("chat.create", { name: "A" });
    const b = await bus.emit("chat.create", { name: "B" });

    await bus.emit("chat.label", { id: a!.chat.id, labels: ["bug", "feature"] });
    await bus.emit("chat.label", { id: b!.chat.id, labels: ["bug"] });

    chatManager.removeLabel("bug");

    const aLoaded = await bus.emit("chat.get.id", { id: a!.chat.id });
    expect(aLoaded?.chat.labels).toEqual(["feature"]);

    const bLoaded = await bus.emit("chat.get.id", { id: b!.chat.id });
    expect(bLoaded?.chat.labels).toBeUndefined();
  });

  test("given chats without the label, when stripping, then chats are unchanged", async () => {
    const { bus, chatManager } = setup();

    const a = await bus.emit("chat.create", { name: "A" });
    await bus.emit("chat.label", { id: a!.chat.id, labels: ["feature"] });

    chatManager.removeLabel("bug");

    const loaded = await bus.emit("chat.get.id", { id: a!.chat.id });
    expect(loaded?.chat.labels).toEqual(["feature"]);
  });
});

describe("chat.model", () => {
  test("given a chat, when setting model, then provider and model are persisted", async () => {
    const { bus } = setup();
    const { chat } = await bus.emit("chat.create", { name: "Test" });

    const result = await bus.emit("chat.model", {
      id: chat.id,
      provider: "ollama",
      model: "qwen3:8b",
    });

    expect(result.chat.provider).toBe("ollama");
    expect(result.chat.model).toBe("qwen3:8b");
  });

  test("given a chat with model, when selecting, then model is returned", async () => {
    const { bus } = setup();
    const { chat } = await bus.emit("chat.create", { name: "Test" });

    await bus.emit("chat.model", {
      id: chat.id,
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
    });

    const loaded = await bus.emit("chat.get.id", { id: chat.id });
    expect(loaded?.chat.provider).toBe("anthropic");
    expect(loaded?.chat.model).toBe("claude-sonnet-4-20250514");
  });

  test("given no chat, when setting model by unknown id, then throws", async () => {
    const { bus } = setup();

    expect(
      bus.emit("chat.model", { id: "nonexistent", provider: "x", model: "y" }),
    ).rejects.toThrow("Chat not found");
  });

  test("given a chat, when setting model, then broadcasts chat:updated", async () => {
    const { bus } = setup();
    const { chat } = await bus.emit("chat.create", { name: "Test" });

    let broadcast: any = null;
    bus.subscribe("chat.updated", (data) => { broadcast = data; });

    await bus.emit("chat.model", {
      id: chat.id,
      provider: "ollama",
      model: "qwen3:8b",
    });

    expect(broadcast).not.toBeNull();
    expect(broadcast.chat.provider).toBe("ollama");
    expect(broadcast.chat.model).toBe("qwen3:8b");
  });
});

describe("chat.create stamps default", () => {
  test("given a default connection with model, when creating chat, then chat inherits provider and model", async () => {
    const { bus, config } = setup();

    await config.set("llms", [{
      id: "conn-1",
      provider: "anthropic",
      name: "Claude",
      grant: "pat" as const,
      credPrefix: "llm.anthropic.pat",
      model: "claude-opus-4-20250514",
      createdAt: "2026-01-01",
    }]);
    await config.set("llmDefault", { id: "conn-1", name: "Claude" });

    const { chat } = await bus.emit("chat.create", { name: "Test" });

    expect(chat.provider).toBe("anthropic");
    expect(chat.model).toBe("claude-opus-4-20250514");
  });

  test("given no default connection, when creating chat, then provider and model are empty", async () => {
    const { bus } = setup();

    const { chat } = await bus.emit("chat.create", { name: "Test" });

    expect(chat.provider).toBe("");
    expect(chat.model).toBe("");
  });

  test("given a default connection without model, when creating chat, then model is empty", async () => {
    const { bus, config } = setup();

    await config.set("llms", [{
      id: "conn-1",
      provider: "ollama",
      name: "Local",
      grant: "local" as const,
      credPrefix: "",
      host: "http://localhost:11434",
      createdAt: "2026-01-01",
    }]);
    await config.set("llmDefault", { id: "conn-1", name: "Local" });

    const { chat } = await bus.emit("chat.create", { name: "Test" });

    expect(chat.provider).toBe("ollama");
    expect(chat.model).toBe("");
  });
});
