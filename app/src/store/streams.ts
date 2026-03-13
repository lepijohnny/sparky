import type { StateCreator } from "zustand";
import type { ChatActivity } from "../types/chat";

export interface StreamBuffer {
  content: string;
  activities: ChatActivity[];
}

export interface StreamsSlice {
  streamBuffers: Map<string, StreamBuffer>;
  streamingChatIds: Set<string>;

  startStream: (chatId: string) => void;
  endStream: (chatId: string) => void;
  appendDelta: (chatId: string, content: string) => void;
  resetContent: (chatId: string) => void;
  addActivity: (chatId: string, activity: ChatActivity) => void;
  getBuffer: (chatId: string) => StreamBuffer | undefined;
  clearBuffer: (chatId: string) => void;
}

const SKIP_ACTIVITY_TYPES = new Set([
  "agent.start",
  "agent.text.delta",
  "agent.thinking.delta",
  "agent.thinking.done",
  "agent.done",
  "agent.stopped",
]);

export const createStreamsSlice: StateCreator<StreamsSlice, [], [], StreamsSlice> = (set, get) => ({
  streamBuffers: new Map(),
  streamingChatIds: new Set(),

  startStream: (chatId) =>
    set((s) => {
      const ids = new Set(s.streamingChatIds);
      ids.add(chatId);
      const buffers = new Map(s.streamBuffers);
      if (!buffers.has(chatId)) buffers.set(chatId, { content: "", activities: [] });
      return { streamingChatIds: ids, streamBuffers: buffers };
    }),

  endStream: (chatId) =>
    set((s) => {
      const ids = new Set(s.streamingChatIds);
      ids.delete(chatId);
      const buffers = new Map(s.streamBuffers);
      buffers.delete(chatId);
      return { streamingChatIds: ids, streamBuffers: buffers };
    }),

  appendDelta: (chatId, content) =>
    set((s) => {
      const buffers = new Map(s.streamBuffers);
      const buf = buffers.get(chatId) ?? { content: "", activities: [] };
      buffers.set(chatId, { ...buf, content: buf.content + content });
      return { streamBuffers: buffers };
    }),

  resetContent: (chatId) =>
    set((s) => {
      const buffers = new Map(s.streamBuffers);
      const buf = buffers.get(chatId);
      if (buf) buffers.set(chatId, { ...buf, content: "" });
      return { streamBuffers: buffers };
    }),

  addActivity: (chatId, activity) => {
    if (SKIP_ACTIVITY_TYPES.has(activity.type)) return;
    set((s) => {
      const buffers = new Map(s.streamBuffers);
      const buf = buffers.get(chatId) ?? { content: "", activities: [] };
      buffers.set(chatId, { ...buf, activities: [...buf.activities, activity] });
      return { streamBuffers: buffers };
    });
  },

  getBuffer: (chatId) => get().streamBuffers.get(chatId),
  clearBuffer: (chatId) =>
    set((s) => {
      const buffers = new Map(s.streamBuffers);
      buffers.delete(chatId);
      return { streamBuffers: buffers };
    }),
});
