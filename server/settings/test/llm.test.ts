import { describe, test, expect, afterAll } from "vitest";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createStorage } from "../../core/storage";
import { createConfiguration } from "../../core/config";
import { createEventBus } from "../../core/bus";
import { LlmSettings } from "../llm";
import { noopLogger } from "../../logger";

const TEST_ROOT = join(tmpdir(), `sparky-llm-test-${Date.now()}`);

function setup() {
  const bus = createEventBus(noopLogger);
  const storage = createStorage(noopLogger, TEST_ROOT).seed();
  const config = createConfiguration(storage);
  const mockCred = { init: async () => {}, get: async () => null, set: async () => {}, delete: async () => {}, deletePrefix: async () => {}, keys: () => [], svcKey: () => "", deleteSvc: async () => {} };
  new LlmSettings(bus, config, mockCred, noopLogger);
  return { bus, config };
}

afterAll(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });

describe("settings.llm.connections.update", () => {
  test("given a connection, when updating model, then model is persisted", async () => {
    const { bus } = setup();
    const { connection } = await bus.emit("settings.llm.connections.add", {
      provider: "anthropic-api",
      name: "Test",
      grant: "pat" as const,
    });

    const result = await bus.emit("settings.llm.connections.update", {
      id: connection.id,
      model: "claude-opus-4-20250514",
    });

    expect(result.connection.model).toBe("claude-opus-4-20250514");
  });

  test("given a connection, when updating thinking, then thinking is persisted", async () => {
    const { bus } = setup();
    const { connection } = await bus.emit("settings.llm.connections.add", {
      provider: "anthropic-api",
      name: "Test",
      grant: "pat" as const,
    });

    const result = await bus.emit("settings.llm.connections.update", {
      id: connection.id,
      thinking: 4,
    });

    expect(result.connection.thinking).toBe(4);
  });

  test("given a connection, when updating model and thinking together, then both are persisted", async () => {
    const { bus } = setup();
    const { connection } = await bus.emit("settings.llm.connections.add", {
      provider: "anthropic-api",
      name: "Test",
      grant: "pat" as const,
    });

    const result = await bus.emit("settings.llm.connections.update", {
      id: connection.id,
      model: "claude-sonnet-4-20250514",
      thinking: 3,
    });

    expect(result.connection.model).toBe("claude-sonnet-4-20250514");
    expect(result.connection.thinking).toBe(3);
  });

  test("given no connection, when updating by unknown id, then throws", async () => {
    const { bus } = setup();

    expect(
      bus.emit("settings.llm.connections.update", { id: "nonexistent", model: "x" }),
    ).rejects.toThrow("Connection not found");
  });

  test("given an updated connection, when listing, then returns updated values", async () => {
    const { bus } = setup();
    const { connection } = await bus.emit("settings.llm.connections.add", {
      provider: "anthropic-api",
      name: "Test",
      grant: "pat" as const,
    });

    await bus.emit("settings.llm.connections.update", {
      id: connection.id,
      model: "claude-opus-4-20250514",
      thinking: 5,
    });

    const { connections } = await bus.emit("settings.llm.connections.list");
    const updated = connections.find((c: any) => c.id === connection.id)!;
    expect(updated.model).toBe("claude-opus-4-20250514");
    expect(updated.thinking).toBe(5);
  });

  test("given a connection with host, when adding local connection, then host is persisted", async () => {
    const { bus } = setup();
    const { connection } = await bus.emit("settings.llm.connections.add", {
      provider: "ollama",
      name: "Local Ollama",
      grant: "local" as const,
      host: "http://localhost:11434",
    });

    expect(connection.host).toBe("http://localhost:11434");
    expect(connection.credPrefix).toBe("");
  });
});
