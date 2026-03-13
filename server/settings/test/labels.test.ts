import { describe, test, expect, beforeEach, afterAll } from "vitest";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createStorage } from "../../core/storage";
import { createConfiguration } from "../../core/config";
import { createEventBus } from "../../core/bus";
import { LabelsSettings } from "../labels";
import { noopLogger } from "../../logger";
import type { Label } from "../labels.types";

const TEST_ROOT = join(tmpdir(), `sparky-labels-test-${Date.now()}`);

function setup() {
  const bus = createEventBus(noopLogger);
  const storage = createStorage(noopLogger, TEST_ROOT).seed();
  const config = createConfiguration(storage);
  storage.write("config.json", {});
  const _labels = new LabelsSettings(bus, config, noopLogger);
  return { bus, config };
}

beforeEach(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });
afterAll(() => { rmSync(TEST_ROOT, { recursive: true, force: true }); });

describe("settings.labels.list", () => {
  test("given no labels, when listing, then returns empty array", async () => {
    const { bus } = setup();
    const result = await bus.emit("settings.labels.list");
    expect(result?.labels).toEqual([]);
  });

  test("given created labels, when listing, then returns all labels", async () => {
    const { bus } = setup();
    await bus.emit("settings.labels.create", { name: "Bug" });
    await bus.emit("settings.labels.create", { name: "Feature" });

    const result = await bus.emit("settings.labels.list");
    expect(result?.labels.length).toBe(2);
    expect(result?.labels[0].name).toBe("Bug");
    expect(result?.labels[1].name).toBe("Feature");
  });
});

describe("settings.labels.create", () => {
  test("given a name, when creating, then returns label with id, name, and color", async () => {
    const { bus } = setup();
    const result = await bus.emit("settings.labels.create", { name: "Bug" });
    expect(result?.label.id).toBeDefined();
    expect(result?.label.name).toBe("Bug");
    expect(result?.label.color).toMatch(/^hsl\(/);
  });

  test("given no color, when creating, then auto-assigns from palette in order", async () => {
    const { bus } = setup();
    const a = await bus.emit("settings.labels.create", { name: "First" });
    const b = await bus.emit("settings.labels.create", { name: "Second" });
    expect(a?.label.color).not.toBe(b?.label.color);
  });

  test("given explicit color, when creating, then uses provided color", async () => {
    const { bus } = setup();
    const result = await bus.emit("settings.labels.create", { name: "Custom", color: "#ff0000" });
    expect(result?.label.color).toBe("#ff0000");
  });

  test("given create, then settings.labels:created is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("settings.labels.created", (data: unknown) => { events.push(data); });

    await bus.emit("settings.labels.create", { name: "Bug" });

    expect(events.length).toBe(1);
    expect((events[0] as any).label.name).toBe("Bug");
  });

  test("given name with whitespace, when creating, then trims name", async () => {
    const { bus } = setup();
    const result = await bus.emit("settings.labels.create", { name: "  Padded  " });
    expect(result?.label.name).toBe("Padded");
  });
});

describe("settings.labels.update", () => {
  test("given existing label, when updating name, then name is changed", async () => {
    const { bus } = setup();
    const created = await bus.emit("settings.labels.create", { name: "Old" });
    const id = created!.label.id;

    const result = await bus.emit("settings.labels.update", { id, name: "New" });
    expect(result?.label.name).toBe("New");
    expect(result?.label.id).toBe(id);
  });

  test("given existing label, when updating color, then color is changed", async () => {
    const { bus } = setup();
    const created = await bus.emit("settings.labels.create", { name: "Test" });
    const id = created!.label.id;

    const result = await bus.emit("settings.labels.update", { id, color: "#00ff00" });
    expect(result?.label.color).toBe("#00ff00");
    expect(result?.label.name).toBe("Test");
  });

  test("given non-existent label, when updating, then throws", async () => {
    const { bus } = setup();
    expect(bus.emit("settings.labels.update", { id: "nope", name: "X" })).rejects.toThrow();
  });

  test("given update, then settings.labels:updated is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("settings.labels.updated", (data: unknown) => { events.push(data); });

    const created = await bus.emit("settings.labels.create", { name: "Test" });
    await bus.emit("settings.labels.update", { id: created!.label.id, name: "Updated" });

    expect(events.length).toBe(1);
    expect((events[0] as any).label.name).toBe("Updated");
  });
});

describe("settings.labels.delete", () => {
  test("given existing label, when deleting, then returns deleted true", async () => {
    const { bus } = setup();
    const created = await bus.emit("settings.labels.create", { name: "Bug" });
    const result = await bus.emit("settings.labels.delete", { id: created!.label.id });
    expect(result?.deleted).toBe(true);
  });

  test("given existing label, when deleting, then label is removed from list", async () => {
    const { bus } = setup();
    const created = await bus.emit("settings.labels.create", { name: "Bug" });
    await bus.emit("settings.labels.delete", { id: created!.label.id });

    const list = await bus.emit("settings.labels.list");
    expect(list?.labels.length).toBe(0);
  });

  test("given non-existent label, when deleting, then returns deleted false", async () => {
    const { bus } = setup();
    const result = await bus.emit("settings.labels.delete", { id: "nope" });
    expect(result?.deleted).toBe(false);
  });

  test("given delete, then settings.labels:deleted is emitted", async () => {
    const { bus } = setup();
    const events: unknown[] = [];
    bus.subscribe("settings.labels.deleted", (data: unknown) => { events.push(data); });

    const created = await bus.emit("settings.labels.create", { name: "Bug" });
    await bus.emit("settings.labels.delete", { id: created!.label.id });

    expect(events.length).toBe(1);
    expect((events[0] as any).id).toBe(created!.label.id);
  });
});

describe("settings.labels.reorder", () => {
  test("given three labels, when reordering, then list reflects new order", async () => {
    const { bus } = setup();
    const a = await bus.emit("settings.labels.create", { name: "A" });
    const b = await bus.emit("settings.labels.create", { name: "B" });
    const c = await bus.emit("settings.labels.create", { name: "C" });

    const result = await bus.emit("settings.labels.reorder", {
      ids: [c!.label.id, a!.label.id, b!.label.id],
    });
    expect(result?.labels.map((l: Label) => l.name)).toEqual(["C", "A", "B"]);

    const list = await bus.emit("settings.labels.list");
    expect(list?.labels.map((l: Label) => l.name)).toEqual(["C", "A", "B"]);
  });

  test("given reorder with unknown ids, when reordering, then unknown ids are skipped", async () => {
    const { bus } = setup();
    const a = await bus.emit("settings.labels.create", { name: "A" });

    const result = await bus.emit("settings.labels.reorder", {
      ids: ["unknown", a!.label.id],
    });
    expect(result?.labels.length).toBe(1);
    expect(result?.labels[0].name).toBe("A");
  });
});
