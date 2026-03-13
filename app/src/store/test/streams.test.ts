import { describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../index";
import type { ChatActivity } from "../../types/chat";

function makeActivity(type: string, messageId = "msg-1"): ChatActivity {
  return {
    kind: "activity",
    type,
    messageId,
    source: "test",
    timestamp: new Date().toISOString(),
  } as ChatActivity;
}

describe("streams slice", () => {
  beforeEach(() => {
    useStore.setState({
      streamBuffers: new Map(),
      streamingChatIds: new Set(),
    });
  });

  test("given no streams, when startStream called, then adds chatId and creates buffer", () => {
    useStore.getState().startStream("chat-1");

    expect(useStore.getState().streamingChatIds.has("chat-1")).toBe(true);
    expect(useStore.getState().streamBuffers.has("chat-1")).toBe(true);
    expect(useStore.getState().getBuffer("chat-1")?.content).toBe("");
  });

  test("given active stream, when appendDelta called, then accumulates content", () => {
    useStore.getState().startStream("chat-1");
    useStore.getState().appendDelta("chat-1", "Hello ");
    useStore.getState().appendDelta("chat-1", "world");

    expect(useStore.getState().getBuffer("chat-1")?.content).toBe("Hello world");
  });

  test("given active stream, when endStream called, then removes chatId and buffer", () => {
    useStore.getState().startStream("chat-1");
    useStore.getState().appendDelta("chat-1", "partial");
    useStore.getState().endStream("chat-1");

    expect(useStore.getState().streamingChatIds.has("chat-1")).toBe(false);
    expect(useStore.getState().streamBuffers.has("chat-1")).toBe(false);
  });

  test("given active stream, when addActivity with tool.start, then stores activity", () => {
    useStore.getState().startStream("chat-1");
    useStore.getState().addActivity("chat-1", makeActivity("agent.tool.start"));

    const buf = useStore.getState().getBuffer("chat-1");
    expect(buf?.activities).toHaveLength(1);
    expect(buf?.activities[0].type).toBe("agent.tool.start");
  });

  test("given active stream, when addActivity with skipped type, then ignores it", () => {
    useStore.getState().startStream("chat-1");
    useStore.getState().addActivity("chat-1", makeActivity("agent.text.delta"));
    useStore.getState().addActivity("chat-1", makeActivity("agent.thinking.delta"));
    useStore.getState().addActivity("chat-1", makeActivity("agent.done"));
    useStore.getState().addActivity("chat-1", makeActivity("agent.start"));

    const buf = useStore.getState().getBuffer("chat-1");
    expect(buf?.activities).toHaveLength(0);
  });

  test("given multiple streams, when one ends, then other unaffected", () => {
    useStore.getState().startStream("chat-1");
    useStore.getState().startStream("chat-2");
    useStore.getState().appendDelta("chat-1", "one");
    useStore.getState().appendDelta("chat-2", "two");
    useStore.getState().endStream("chat-1");

    expect(useStore.getState().streamingChatIds.has("chat-1")).toBe(false);
    expect(useStore.getState().streamingChatIds.has("chat-2")).toBe(true);
    expect(useStore.getState().getBuffer("chat-2")?.content).toBe("two");
  });

  test("given no buffer, when appendDelta called, then creates buffer with content", () => {
    useStore.getState().appendDelta("chat-1", "text");

    expect(useStore.getState().getBuffer("chat-1")?.content).toBe("text");
  });

  test("given buffer with content, when clearBuffer called, then removes it", () => {
    useStore.getState().startStream("chat-1");
    useStore.getState().appendDelta("chat-1", "text");
    useStore.getState().clearBuffer("chat-1");

    expect(useStore.getState().getBuffer("chat-1")).toBeUndefined();
  });
});
