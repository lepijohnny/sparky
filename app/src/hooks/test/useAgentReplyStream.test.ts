import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { WsConnection } from "../../lib/ws";
import { useAgentReplyStream } from "../useAgentReplyStream";
import { mockConn } from "./mockWs.mock";

const CHAT_ID = "chat-1";
const TURN_ID = "turn-1";

function setup(chatId = CHAT_ID) {
  const conn = mockConn();
  const onEntry = vi.fn();
  const onEnd = vi.fn();

  const { result } = renderHook(() =>
    useAgentReplyStream(
      conn as unknown as WsConnection,
      chatId,
      onEntry,
      onEnd,
    ),
  );

  return { conn, result, onEntry, onEnd };
}

function userMessage(chatId = CHAT_ID) {
  return {
    chatId,
    kind: "message" as const,
    id: TURN_ID,
    role: "user",
    content: "Hello",
    timestamp: new Date().toISOString(),
  };
}

function textDelta(content: string, chatId = CHAT_ID) {
  return {
    chatId,
    kind: "activity" as const,
    messageId: TURN_ID,
    source: "agent",
    type: "agent.text.delta",
    timestamp: new Date().toISOString(),
    data: { content },
  };
}

function activity(type: string, data?: any, chatId = CHAT_ID) {
  return {
    chatId,
    kind: "activity" as const,
    messageId: TURN_ID,
    source: "agent",
    type,
    timestamp: new Date().toISOString(),
    data,
  };
}

function doneActivity(chatId = CHAT_ID) {
  return activity("agent.done", undefined, chatId);
}

function stoppedActivity(chatId = CHAT_ID) {
  return activity("agent.stopped", undefined, chatId);
}

describe("useAgentReplyStream", () => {
  test("given no events, when mounted, then active is false", () => {
    const { result } = setup();
    expect(result.current.active).toBe(false);
  });

  test("given a user message event, when received, then becomes active and calls onEntry", () => {
    const { conn, result, onEntry } = setup();
    act(() => { conn.broadcast("chat.event", userMessage()); });
    expect(result.current.active).toBe(true);
    expect(onEntry).toHaveBeenCalledTimes(1);
    expect(onEntry.mock.calls[0][0].kind).toBe("message");
  });

  test("given text deltas, when received, then does not call onEntry", () => {
    const { conn, onEntry } = setup();
    act(() => { conn.broadcast("chat.event", userMessage()); });
    const countAfterUser = onEntry.mock.calls.length;
    act(() => { conn.broadcast("chat.event", textDelta("Hello ")); });
    act(() => { conn.broadcast("chat.event", textDelta("world")); });
    expect(onEntry).toHaveBeenCalledTimes(countAfterUser);
  });

  test("given a done event, when received, then resets to inactive and calls onEnd", () => {
    const { conn, result, onEnd } = setup();
    act(() => { conn.broadcast("chat.event", userMessage()); });
    expect(result.current.active).toBe(true);
    act(() => { conn.broadcast("chat.event", doneActivity()); });
    expect(result.current.active).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("given a stopped event, when received, then resets to inactive and calls onEnd", () => {
    const { conn, result, onEnd } = setup();
    act(() => { conn.broadcast("chat.event", userMessage()); });
    act(() => { conn.broadcast("chat.event", stoppedActivity()); });
    expect(result.current.active).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("given activities, when received, then forwarded to onEntry", () => {
    const { conn, onEntry } = setup();
    act(() => { conn.broadcast("chat.event", activity("agent.thinking.start")); });
    act(() => { conn.broadcast("chat.event", activity("agent.tool.start", { id: "c0", name: "read_file" })); });
    expect(onEntry).toHaveBeenCalledTimes(2);
    expect(onEntry.mock.calls[0][0].type).toBe("agent.thinking.start");
    expect(onEntry.mock.calls[1][0].type).toBe("agent.tool.start");
  });

  test("given thinking delta, when received, then not forwarded to onEntry", () => {
    const { conn, onEntry } = setup();
    act(() => { conn.broadcast("chat.event", activity("agent.thinking.delta", { content: "hmm" })); });
    expect(onEntry).not.toHaveBeenCalled();
  });

  test("given events for a different chat, when received, then ignored", () => {
    const { conn, result, onEntry } = setup("chat-1");
    act(() => { conn.broadcast("chat.event", userMessage("chat-2")); });
    act(() => { conn.broadcast("chat.event", textDelta("ignored", "chat-2")); });
    expect(result.current.active).toBe(false);
    expect(onEntry).not.toHaveBeenCalled();
  });

  test("given text deltas without text.done, when stopped, then synthesizes partial message", () => {
    const { conn, onEntry } = setup();
    act(() => { conn.broadcast("chat.event", activity("agent.start")); });
    act(() => { conn.broadcast("chat.event", textDelta("Hello ")); });
    act(() => { conn.broadcast("chat.event", textDelta("world")); });
    act(() => { conn.broadcast("chat.event", stoppedActivity()); });

    const messages = onEntry.mock.calls
      .map((c: any) => c[0])
      .filter((e: any) => e.kind === "message" && e.role === "assistant");
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe("Hello world");
  });

  test("given a full stream cycle, when done then new message, then active resets", () => {
    const { conn, result } = setup();
    act(() => { conn.broadcast("chat.event", userMessage()); });
    act(() => { conn.broadcast("chat.event", activity("agent.thinking.start")); });
    act(() => { conn.broadcast("chat.event", textDelta("Hi")); });
    act(() => { conn.broadcast("chat.event", doneActivity()); });
    expect(result.current.active).toBe(false);

    act(() => { conn.broadcast("chat.event", userMessage()); });
    expect(result.current.active).toBe(true);
  });

  // ── setActive (resume from existing stream) ──

  test("given setActive true, then becomes active", () => {
    const { result } = setup();
    act(() => { result.current.setActive(true); });
    expect(result.current.active).toBe(true);
    expect(result.current.activities).toEqual([]);
  });

  test("given setActive with seed activities, then activities are populated", () => {
    const { result } = setup();
    const seed = [
      { kind: "activity" as const, messageId: TURN_ID, source: "agent", type: "agent.tool.start" as const, timestamp: new Date().toISOString(), data: { id: "t1", name: "read", input: {} } },
    ];
    act(() => { result.current.setActive(true, seed); });
    expect(result.current.active).toBe(true);
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.activities[0].type).toBe("agent.tool.start");
  });

  test("given setActive false, then resets to inactive", () => {
    const { result } = setup();
    act(() => { result.current.setActive(true); });
    expect(result.current.active).toBe(true);
    act(() => { result.current.setActive(false); });
    expect(result.current.active).toBe(false);
  });

  // ── error handling ──

  test("given agent.error event, when received, then forwarded to onEntry", () => {
    const { conn, onEntry } = setup();
    act(() => { conn.broadcast("chat.event", activity("agent.error", { message: "boom" })); });
    expect(onEntry).toHaveBeenCalledTimes(1);
    expect(onEntry.mock.calls[0][0].type).toBe("agent.error");
  });

  test("given agent.error during active stream, when received, then ends stream and calls onEnd", () => {
    const { conn, result, onEnd } = setup();
    act(() => { conn.broadcast("chat.event", userMessage()); });
    expect(result.current.active).toBe(true);
    act(() => { conn.broadcast("chat.event", activity("agent.error", { message: "boom" })); });
    expect(result.current.active).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("given text deltas then agent.error, when received, then synthesizes partial message before ending", () => {
    const { conn, onEntry, onEnd } = setup();
    act(() => { conn.broadcast("chat.event", activity("agent.start")); });
    act(() => { conn.broadcast("chat.event", textDelta("partial ")); });
    act(() => { conn.broadcast("chat.event", textDelta("content")); });
    act(() => { conn.broadcast("chat.event", activity("agent.error", { message: "crash" })); });

    const messages = onEntry.mock.calls
      .map((c: any) => c[0])
      .filter((e: any) => e.kind === "message" && e.role === "assistant");
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe("partial content");
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  test("given agent.done after agent.error already ended stream, then late terminal is passed through without calling onEnd again", () => {
    const { conn, result, onEntry, onEnd } = setup();
    act(() => { conn.broadcast("chat.event", userMessage()); });
    act(() => { conn.broadcast("chat.event", activity("agent.error", { message: "crash" })); });
    expect(result.current.active).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);

    act(() => { conn.broadcast("chat.event", doneActivity()); });
    expect(onEnd).toHaveBeenCalledTimes(1);
    const doneEntries = onEntry.mock.calls
      .map((c: any) => c[0])
      .filter((e: any) => e.type === "agent.done");
    expect(doneEntries.length).toBe(1);
  });

  // ── activities accumulation ──

  test("given tool activities during stream, when accumulated, then activities array grows", () => {
    const { conn, result } = setup();
    act(() => { conn.broadcast("chat.event", activity("agent.thinking.start")); });
    act(() => { conn.broadcast("chat.event", activity("agent.tool.start", { id: "t1", name: "read_file" })); });
    act(() => { conn.broadcast("chat.event", activity("agent.tool.result", { id: "t1", output: "done" })); });
    expect(result.current.activities).toHaveLength(3);
    expect(result.current.activities[0].type).toBe("agent.thinking.start");
    expect(result.current.activities[1].type).toBe("agent.tool.start");
    expect(result.current.activities[2].type).toBe("agent.tool.result");
  });

  test("given stream ends, when reset, then activities are cleared", () => {
    const { conn, result } = setup();
    act(() => { conn.broadcast("chat.event", activity("agent.tool.start", { id: "t1", name: "read" })); });
    expect(result.current.activities).toHaveLength(1);
    act(() => { conn.broadcast("chat.event", doneActivity()); });
    expect(result.current.activities).toEqual([]);
  });

  // ── assistant message clears content buffer ──

  test("given text.done arrives as assistant message, when followed by done, then no partial synthesized", () => {
    const { conn, onEntry } = setup();
    act(() => { conn.broadcast("chat.event", activity("agent.start")); });
    act(() => { conn.broadcast("chat.event", textDelta("Hello world")); });
    act(() => {
      conn.broadcast("chat.event", {
        chatId: CHAT_ID,
        kind: "message",
        id: TURN_ID,
        role: "assistant",
        content: "Hello world",
        timestamp: new Date().toISOString(),
      });
    });
    act(() => { conn.broadcast("chat.event", doneActivity()); });

    const assistantMessages = onEntry.mock.calls
      .map((c: any) => c[0])
      .filter((e: any) => e.kind === "message" && e.role === "assistant");
    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].content).toBe("Hello world");
  });
});
