import type { StateCreator } from "zustand";
import type { ServiceInfo } from "../types/service";

export interface ConnectionsSlice {
  connections: ServiceInfo[];
  selectedConnectionId: string | null;
  connectionGuides: Map<string, string | null>;

  setConnections: (connections: ServiceInfo[]) => void;
  selectConnection: (id: string | null) => void;
  patchConnection: (conn: ServiceInfo) => void;
  removeConnection: (id: string) => void;
  setConnectionGuide: (id: string, content: string | null) => void;
}

export const createConnectionsSlice: StateCreator<ConnectionsSlice, [], [], ConnectionsSlice> = (set) => ({
  connections: [],
  selectedConnectionId: null,
  connectionGuides: new Map(),

  setConnections: (connections) => set({ connections }),

  selectConnection: (id) => set({ selectedConnectionId: id }),

  patchConnection: (conn) =>
    set((s) => {
      const idx = s.connections.findIndex((c) => c.id === conn.id);
      if (idx === -1) return { connections: [...s.connections, conn] };
      const next = [...s.connections];
      next[idx] = conn;
      return { connections: next };
    }),

  removeConnection: (id) =>
    set((s) => {
      const next = s.connections.filter((c) => c.id !== id);
      if (next.length === s.connections.length) return s;
      const updates: Partial<ConnectionsSlice> = { connections: next };
      if (s.selectedConnectionId === id) updates.selectedConnectionId = null;
      return updates;
    }),

  setConnectionGuide: (id, content) =>
    set((s) => {
      const next = new Map(s.connectionGuides);
      next.set(id, content);
      return { connectionGuides: next };
    }),
});
