import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { useLabelDragReorder } from "../useLabelDragReorder";

const items = ["A", "B", "C", "D"];

function pointerDown(result: any, index: number): void {
  const props = result.current.gripProps(index);
  props.onPointerDown({ preventDefault: vi.fn() } as unknown as React.PointerEvent);
}

function pointerUp(): void {
  document.dispatchEvent(new PointerEvent("pointerup"));
}

describe("useLabelDragReorder", () => {
  // ── Initial state ──

  test("given items, then returns same items in order", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useLabelDragReorder(items, onReorder));
    expect(result.current.items).toEqual(["A", "B", "C", "D"]);
    expect(result.current.dragIndex).toBeNull();
  });

  // ── gripProps shape ──

  test("given gripProps, then returns grab cursor and touch-action none", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useLabelDragReorder(items, onReorder));
    const props = result.current.gripProps(0);
    expect(props.style.cursor).toBe("grab");
    expect(props.style.touchAction).toBe("none");
    expect(typeof props.onPointerDown).toBe("function");
  });

  // ── Source sync ──

  test("given source changes while not dragging, then items update", () => {
    const onReorder = vi.fn();
    const { result, rerender } = renderHook(
      ({ src }) => useLabelDragReorder(src, onReorder),
      { initialProps: { src: items } },
    );

    const newItems = ["X", "Y", "Z"];
    rerender({ src: newItems });
    expect(result.current.items).toEqual(["X", "Y", "Z"]);
  });

  test("given same source reference re-rendered, then items stay stable (no unnecessary reset)", () => {
    const onReorder = vi.fn();
    const { result, rerender } = renderHook(
      ({ src }) => useLabelDragReorder(src, onReorder),
      { initialProps: { src: items } },
    );
    const first = result.current.items;
    rerender({ src: items });
    expect(result.current.items).toBe(first);
  });

  // ── Drag start ──

  test("given pointerDown on index 1, then dragIndex is 1", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useLabelDragReorder(items, onReorder));

    act(() => pointerDown(result, 1));
    expect(result.current.dragIndex).toBe(1);
  });

  test("given pointerDown, then preventDefault is called", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useLabelDragReorder(items, onReorder));
    const preventDefault = vi.fn();

    act(() => {
      result.current.gripProps(0).onPointerDown({ preventDefault } as unknown as React.PointerEvent);
    });
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  // ── Drag end ──

  test("given pointerDown then pointerUp, then dragIndex resets to null", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useLabelDragReorder(items, onReorder));

    act(() => pointerDown(result, 2));
    expect(result.current.dragIndex).toBe(2);

    act(() => pointerUp());
    expect(result.current.dragIndex).toBeNull();
  });

  test("given drag without move, then onReorder is called with original order", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useLabelDragReorder(items, onReorder));

    act(() => pointerDown(result, 0));
    act(() => pointerUp());

    expect(onReorder).toHaveBeenCalledOnce();
    expect(onReorder).toHaveBeenCalledWith(["A", "B", "C", "D"]);
  });

  test("given drag ends, then document listeners are cleaned up", () => {
    const onReorder = vi.fn();
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { result } = renderHook(() => useLabelDragReorder(items, onReorder));

    act(() => pointerDown(result, 0));
    act(() => pointerUp());

    const removedEvents = removeSpy.mock.calls.map(([event]) => event);
    expect(removedEvents).toContain("pointermove");
    expect(removedEvents).toContain("pointerup");
    removeSpy.mockRestore();
  });

  // ── Post-drop stability (the revert bug fix) ──

  test("given drop completes, then same source ref does NOT revert items", () => {
    const onReorder = vi.fn();
    const { result, rerender } = renderHook(
      ({ src }) => useLabelDragReorder(src, onReorder),
      { initialProps: { src: items } },
    );

    act(() => pointerDown(result, 0));
    act(() => pointerUp());

    // Re-render with same reference — should NOT reset
    rerender({ src: items });
    expect(result.current.items).toEqual(["A", "B", "C", "D"]);
    expect(result.current.dragIndex).toBeNull();
  });

  test("given drop completes, then new source ref DOES sync items", () => {
    const onReorder = vi.fn();
    const { result, rerender } = renderHook(
      ({ src }) => useLabelDragReorder(src, onReorder),
      { initialProps: { src: items } },
    );

    act(() => pointerDown(result, 0));
    act(() => pointerUp());

    const serverItems = ["D", "C", "B", "A"];
    rerender({ src: serverItems });
    expect(result.current.items).toEqual(["D", "C", "B", "A"]);
  });

  // ── Multiple drags ──

  test("given two sequential drags, then onReorder is called twice", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useLabelDragReorder(items, onReorder));

    act(() => pointerDown(result, 0));
    act(() => pointerUp());

    act(() => pointerDown(result, 3));
    act(() => pointerUp());

    expect(onReorder).toHaveBeenCalledTimes(2);
  });

  // ── Drag snapshot uses rendered items, not sourceItems (regression) ──

  test("given reorder then server echo, second drag snapshots from rendered order not stale source", () => {
    // Scenario: user reorders [A,B,C,D] → [B,A,C,D] via drag.
    // Server echoes back the new order as a new sourceItems reference.
    // A second drag must snapshot from the current rendered [B,A,C,D],
    // NOT from any stale captured sourceItems.
    const onReorder = vi.fn();
    const { result, rerender } = renderHook(
      ({ src }) => useLabelDragReorder(src, onReorder),
      { initialProps: { src: ["A", "B", "C", "D"] } },
    );

    // Simulate first drag: pointerDown on index 0, move to index 1
    act(() => pointerDown(result, 0));

    // Simulate pointermove hitting a row with data-drag-idx=1
    const row = document.createElement("div");
    row.setAttribute("data-drag-idx", "1");
    document.body.appendChild(row);
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(row);

    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    });

    expect(result.current.items).toEqual(["B", "A", "C", "D"]);

    act(() => pointerUp());
    expect(onReorder).toHaveBeenCalledWith(["B", "A", "C", "D"]);

    // Server echoes back the new order
    rerender({ src: ["B", "A", "C", "D"] });
    expect(result.current.items).toEqual(["B", "A", "C", "D"]);

    // Second drag: move index 0 (B) to index 2
    row.setAttribute("data-drag-idx", "2");
    act(() => pointerDown(result, 0));
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    });

    // B should move to index 2: [A, C, B, D]
    // If snapshot was stale (original [A,B,C,D]), splicing index 0 to 2
    // would give [B, C, A, D] — which is WRONG.
    expect(result.current.items).toEqual(["A", "C", "B", "D"]);

    act(() => pointerUp());

    // Clean up
    document.body.removeChild(row);
    document.elementFromPoint = origElementFromPoint;
  });

  test("given optimistic local state diverges from source, drag uses local rendered order", () => {
    // Scenario: local items are [C,B,A] after a drag, but sourceItems
    // still points to the old [A,B,C] (server hasn't responded yet).
    // A new drag must snapshot from [C,B,A].
    const onReorder = vi.fn();
    const original = ["A", "B", "C"];
    const { result } = renderHook(() => useLabelDragReorder(original, onReorder));

    // First drag: move index 0 (A) to index 2
    const row = document.createElement("div");
    row.setAttribute("data-drag-idx", "2");
    document.body.appendChild(row);
    const origElementFromPoint = document.elementFromPoint;
    document.elementFromPoint = vi.fn().mockReturnValue(row);

    act(() => pointerDown(result, 0));
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    });
    expect(result.current.items).toEqual(["B", "C", "A"]);
    act(() => pointerUp());

    // sourceItems ref hasn't changed (server hasn't pushed yet).
    // Local state is [B, C, A].

    // Second drag: move index 2 (A) to index 0
    row.setAttribute("data-drag-idx", "0");
    act(() => pointerDown(result, 2));
    act(() => {
      document.dispatchEvent(new PointerEvent("pointermove", { clientX: 0, clientY: 0 }));
    });

    // Should restore original order [A, B, C]
    // If snapshot was taken from stale sourceItems [A,B,C],
    // splicing index 2 (C) to 0 would give [C, A, B] — WRONG.
    expect(result.current.items).toEqual(["A", "B", "C"]);

    act(() => pointerUp());

    document.body.removeChild(row);
    document.elementFromPoint = origElementFromPoint;
  });

  // ── Edge cases ──

  test("given empty items, then returns empty array and drag works", () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useLabelDragReorder([], onReorder));
    expect(result.current.items).toEqual([]);
    expect(result.current.dragIndex).toBeNull();
  });

  test("given single item, then drag start and end works", () => {
    const onReorder = vi.fn();
    const single = ["only"];
    const { result } = renderHook(() => useLabelDragReorder(single, onReorder));

    act(() => pointerDown(result, 0));
    expect(result.current.dragIndex).toBe(0);

    act(() => pointerUp());
    expect(result.current.dragIndex).toBeNull();
    expect(onReorder).toHaveBeenCalledWith(["only"]);
  });
});
