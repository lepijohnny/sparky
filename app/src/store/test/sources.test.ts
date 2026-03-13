import { describe, test, expect, beforeEach } from "vitest";
import { useStore } from "../index";
import type { Source } from "../../types/source";

function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    id: crypto.randomUUID(),
    name: "test.pdf",
    type: "file",
    location: "/tmp/test.pdf",
    fileCount: 1,
    chunkCount: 10,
    mode: "hybrid",
    status: "ready",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("sources slice", () => {
  beforeEach(() => {
    useStore.setState({ sources: [], selectedSourceId: null });
  });

  test("given empty store, when setSources called, then stores sources", () => {
    const s1 = makeSource();
    const s2 = makeSource();
    useStore.getState().setSources([s1, s2]);

    expect(useStore.getState().sources).toHaveLength(2);
  });

  test("given sources exist, when patchSource called with known id, then updates it", () => {
    const source = makeSource({ status: "pending" });
    useStore.getState().setSources([source]);
    useStore.getState().patchSource({ ...source, status: "ready" });

    expect(useStore.getState().sources[0].status).toBe("ready");
  });

  test("given sources exist, when patchSource called with unknown id, then adds it", () => {
    const existing = makeSource();
    useStore.getState().setSources([existing]);
    const newSource = makeSource();
    useStore.getState().patchSource(newSource);

    expect(useStore.getState().sources).toHaveLength(2);
  });

  test("given selected source, when removeSource called for it, then clears selection", () => {
    const source = makeSource();
    useStore.getState().setSources([source]);
    useStore.getState().selectSource(source.id);
    useStore.getState().removeSource(source.id);

    expect(useStore.getState().sources).toHaveLength(0);
    expect(useStore.getState().selectedSourceId).toBeNull();
  });

  test("given selected source, when removeSource called for different, then keeps selection", () => {
    const s1 = makeSource();
    const s2 = makeSource();
    useStore.getState().setSources([s1, s2]);
    useStore.getState().selectSource(s1.id);
    useStore.getState().removeSource(s2.id);

    expect(useStore.getState().selectedSourceId).toBe(s1.id);
  });
});
