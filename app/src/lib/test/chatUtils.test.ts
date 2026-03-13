import { describe, expect, test } from "vitest";
import type { ChatActivity, ChatEntry } from "../../types/chat";
import { collapseEntries } from "../chatUtils";

function msg(id: string, role: "user" | "assistant", content: string, rowid?: number): ChatEntry {
  return { kind: "message", id, role, content, timestamp: new Date().toISOString(), rowid };
}

function act(messageId: string, type: string, data?: any): ChatEntry {
  return { kind: "activity", messageId, source: "agent", type, timestamp: new Date().toISOString(), data } as ChatActivity;
}

describe("collapseEntries", () => {
  test("given empty entries, then returns empty array", () => {
    expect(collapseEntries([])).toEqual([]);
  });

  test("given single user+assistant turn with done, then returns user and assistant messages", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hello"),
      msg("t1", "assistant", "Hi there"),
      act("t1", "agent.done"),
    ];
    const result = collapseEntries(entries);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "t1-user", role: "user", content: "Hello", status: "done" });
    expect(result[1]).toMatchObject({ id: "t1-assistant", role: "assistant", content: "Hi there", status: "done" });
  });

  test("given multiple turns, then returns messages in order", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "First"),
      msg("t1", "assistant", "Reply 1"),
      act("t1", "agent.done"),
      msg("t2", "user", "Second"),
      msg("t2", "assistant", "Reply 2"),
      act("t2", "agent.done"),
    ];
    const result = collapseEntries(entries);
    expect(result).toHaveLength(4);
    expect(result[0].content).toBe("First");
    expect(result[1].content).toBe("Reply 1");
    expect(result[2].content).toBe("Second");
    expect(result[3].content).toBe("Reply 2");
  });

  test("given stopped turn, then assistant status is stopped", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hello"),
      msg("t1", "assistant", "Partial"),
      act("t1", "agent.stopped"),
    ];
    const result = collapseEntries(entries);
    expect(result[1].status).toBe("stopped");
  });

  test("given error turn, then assistant status is error", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hello"),
      act("t1", "agent.error", { message: "boom" }),
      act("t1", "agent.done"),
    ];
    const result = collapseEntries(entries);
    expect(result[1].status).toBe("error");
    expect(result[1].activities).toHaveLength(1);
    expect(result[1].activities[0].type).toBe("agent.error");
  });

  test("given error then done, then status stays error", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hello"),
      msg("t1", "assistant", ""),
      act("t1", "agent.error", { message: "fail" }),
      act("t1", "agent.done"),
    ];
    const result = collapseEntries(entries);
    expect(result[1].status).toBe("error");
  });

  test("given tool activities, then collected on assistant message", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Read this"),
      act("t1", "agent.tool.start", { id: "c1", name: "read_file" }),
      act("t1", "agent.tool.result", { id: "c1", output: "content" }),
      msg("t1", "assistant", "Here it is"),
      act("t1", "agent.done"),
    ];
    const result = collapseEntries(entries);
    expect(result[1].activities).toHaveLength(2);
    expect(result[1].activities[0].type).toBe("agent.tool.start");
    expect(result[1].activities[1].type).toBe("agent.tool.result");
  });

  test("given hidden activity types, then filtered out", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hi"),
      act("t1", "agent.start"),
      act("t1", "agent.thinking.start"),
      act("t1", "agent.thinking.done"),
      act("t1", "agent.tool.start", { id: "c1", name: "read" }),
      msg("t1", "assistant", "Done"),
      act("t1", "agent.done"),
    ];
    const result = collapseEntries(entries);
    const types = result[1].activities.map((a) => a.type);
    expect(types).not.toContain("agent.start");
    expect(types).not.toContain("agent.thinking.done");
    expect(types).toContain("agent.thinking.start");
    expect(types).toContain("agent.tool.start");
  });

  test("given user message without assistant reply (still streaming), then no assistant message", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hello"),
    ];
    const result = collapseEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });

  test("given user message with activities but no terminal, then no assistant message", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hello"),
      act("t1", "agent.tool.start", { id: "c1", name: "read" }),
    ];
    const result = collapseEntries(entries);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });

  test("given only assistant message (no user), then ignored", () => {
    const entries: ChatEntry[] = [
      msg("t1", "assistant", "Orphan"),
      act("t1", "agent.done"),
    ];
    const result = collapseEntries(entries);
    expect(result).toHaveLength(0);
  });

  test("given knowledge activity, then included in activities", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "What is X?"),
      act("t1", "agent.knowledge", { sources: ["doc.md"] }),
      msg("t1", "assistant", "X is..."),
      act("t1", "agent.done"),
    ];
    const result = collapseEntries(entries);
    expect(result[1].activities).toHaveLength(1);
    expect(result[1].activities[0].type).toBe("agent.knowledge");
  });

  test("given user messages with empty activities, then activities arrays are empty", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hello"),
      msg("t1", "assistant", "Hi"),
      act("t1", "agent.done"),
    ];
    const result = collapseEntries(entries);
    expect(result[0].activities).toEqual([]);
  });

  test("given assistant message without content, then content is empty string", () => {
    const entries: ChatEntry[] = [
      msg("t1", "user", "Hello"),
      msg("t1", "assistant", ""),
      act("t1", "agent.error", { message: "crash" }),
    ];
    const result = collapseEntries(entries);
    expect(result[1].content).toBe("");
    expect(result[1].status).toBe("error");
  });
});
