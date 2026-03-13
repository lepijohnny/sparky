import { describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../index";
import type { ServiceInfo } from "../../types/service";

function makeService(overrides: Partial<ServiceInfo> = {}): ServiceInfo {
  return {
    id: "github",
    label: "GitHub",
    baseUrl: "https://api.github.com",
    auth: { strategy: "bearer" },
    endpoints: [],
    ...overrides,
  };
}

describe("connections slice", () => {
  beforeEach(() => {
    useStore.setState({ connections: [], selectedConnectionId: null });
  });

  test("given empty store, when setConnections called, then stores connections", () => {
    useStore.getState().setConnections([makeService(), makeService({ id: "slack", label: "Slack" })]);
    expect(useStore.getState().connections).toHaveLength(2);
  });

  test("given connections exist, when patchConnection called with known id, then updates it", () => {
    useStore.getState().setConnections([makeService()]);
    useStore.getState().patchConnection(makeService({ label: "GitHub Updated" }));

    expect(useStore.getState().connections).toHaveLength(1);
    expect(useStore.getState().connections[0].label).toBe("GitHub Updated");
  });

  test("given connections exist, when patchConnection called with unknown id, then adds it", () => {
    useStore.getState().setConnections([makeService()]);
    useStore.getState().patchConnection(makeService({ id: "slack", label: "Slack" }));

    expect(useStore.getState().connections).toHaveLength(2);
  });

  test("given selected connection, when removeConnection called for it, then clears selection", () => {
    useStore.getState().setConnections([makeService()]);
    useStore.getState().selectConnection("github");
    useStore.getState().removeConnection("github");

    expect(useStore.getState().connections).toHaveLength(0);
    expect(useStore.getState().selectedConnectionId).toBeNull();
  });

  test("given selected connection, when removeConnection called for different, then keeps selection", () => {
    useStore.getState().setConnections([makeService(), makeService({ id: "slack", label: "Slack" })]);
    useStore.getState().selectConnection("github");
    useStore.getState().removeConnection("slack");

    expect(useStore.getState().selectedConnectionId).toBe("github");
  });
});
