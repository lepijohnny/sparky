import { describe, test, expect } from "vitest";
import { RoutineSchema, RoutineActionSchema, RoutineFilterSchema } from "../routine.types";

describe("routine schemas", () => {
  test("given valid chat action, when parse, then succeeds", () => {
    const result = RoutineActionSchema.parse({
      type: "chat",
      prompt: "Summarize my emails",
    });
    expect(result.type).toBe("chat");
  });

  test("given chat action with provider and model, when parse, then includes them", () => {
    const result = RoutineActionSchema.parse({
      type: "chat",
      prompt: "Hello",
      provider: "anthropic",
      model: "claude-4",
    });
    expect(result).toEqual({
      type: "chat",
      prompt: "Hello",
      provider: "anthropic",
      model: "claude-4",
    });
  });

  test("given chat action without prompt, when parse, then throws", () => {
    expect(() => RoutineActionSchema.parse({ type: "chat" })).toThrow();
  });

  test("given valid archive action, when parse, then succeeds", () => {
    const result = RoutineActionSchema.parse({
      type: "archive",
      filter: { olderThan: 30 },
    });
    expect(result.type).toBe("archive");
  });

  test("given valid flag action, when parse, then succeeds", () => {
    const result = RoutineActionSchema.parse({
      type: "flag",
      flag: true,
      filter: { flagged: false },
    });
    expect(result.type).toBe("flag");
  });

  test("given valid label action, when parse, then succeeds", () => {
    const result = RoutineActionSchema.parse({
      type: "label",
      labelId: "abc",
      filter: {},
    });
    expect(result.type).toBe("label");
  });

  test("given label action with remove, when parse, then includes remove flag", () => {
    const result = RoutineActionSchema.parse({
      type: "label",
      labelId: "abc",
      remove: true,
      filter: {},
    });
    expect(result).toMatchObject({ remove: true });
  });

  test("given unknown action type, when parse, then throws", () => {
    expect(() => RoutineActionSchema.parse({ type: "unknown" })).toThrow();
  });

  test("given valid filter, when parse, then succeeds", () => {
    const result = RoutineFilterSchema.parse({
      olderThan: 7,
      nameContains: "test",
      hasLabel: "work",
      archived: false,
      flagged: true,
    });
    expect(result.olderThan).toBe(7);
  });

  test("given empty filter, when parse, then succeeds", () => {
    expect(RoutineFilterSchema.parse({})).toEqual({});
  });

  test("given valid routine, when parse, then succeeds", () => {
    const result = RoutineSchema.parse({
      id: "abc-123",
      name: "Test",
      cron: "0 9 * * *",
      action: { type: "chat", prompt: "Hi" },
      enabled: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    expect(result.name).toBe("Test");
  });

  test("given routine without name, when parse, then throws", () => {
    expect(() => RoutineSchema.parse({
      id: "abc",
      name: "",
      cron: "0 9 * * *",
      action: { type: "chat", prompt: "Hi" },
      enabled: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    })).toThrow();
  });
});
