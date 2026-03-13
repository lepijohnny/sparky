import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useChatAutoScroll } from "../useChatAutoScroll";

function mockScrollDiv(opts: { scrollHeight: number; clientHeight: number; initialScrollTop?: number }) {
  let _scrollTop = opts.initialScrollTop ?? 0;
  const el = {
    scrollHeight: opts.scrollHeight,
    clientHeight: opts.clientHeight,
    style: {} as CSSStyleDeclaration,
  } as unknown as HTMLDivElement;

  Object.defineProperty(el, "scrollTop", {
    get: () => _scrollTop,
    set: (v: number) => { _scrollTop = v; },
    configurable: true,
  });

  return { el, getScrollTop: () => _scrollTop };
}

function assignRef(result: { current: { ref: React.RefObject<HTMLDivElement | null> } }, el: HTMLDivElement): void {
  (result.current.ref as { current: HTMLDivElement | null }).current = el;
}

describe("useChatAutoScroll", () => {
  test("given defaults, then isNearBottom is true", () => {
    const { result } = renderHook(() =>
      useChatAutoScroll({ streaming: false, hasMore: false }),
    );
    expect(result.current.isNearBottom).toBe(true);
  });

  test("given defaults, then ref starts as null", () => {
    const { result } = renderHook(() =>
      useChatAutoScroll({ streaming: false, hasMore: false }),
    );
    expect(result.current.ref.current).toBeNull();
  });

  test("given scroll position within threshold, then isNearBottom is true", () => {
    const { el } = mockScrollDiv({ scrollHeight: 1000, clientHeight: 100, initialScrollTop: 880 });

    const { result } = renderHook(() =>
      useChatAutoScroll({ streaming: false, hasMore: false, bottomThreshold: 80 }),
    );
    assignRef(result, el);

    act(() => result.current.onScroll());
    expect(result.current.isNearBottom).toBe(true);
  });

  test("given scroll far from bottom, then streaming does NOT auto-scroll", () => {
    const { el, getScrollTop } = mockScrollDiv({ scrollHeight: 1000, clientHeight: 100, initialScrollTop: 200 });

    const { result, rerender } = renderHook(
      ({ dep }) => useChatAutoScroll({ streaming: true, hasMore: false, bottomThreshold: 80, deps: [dep] }),
      { initialProps: { dep: 1 } },
    );
    assignRef(result, el);

    act(() => result.current.onScroll());
    rerender({ dep: 2 });
    expect(getScrollTop()).toBe(200);
  });

  test("given exactly at threshold boundary, then streaming does NOT auto-scroll", () => {
    const { el, getScrollTop } = mockScrollDiv({ scrollHeight: 1000, clientHeight: 100, initialScrollTop: 820 });

    const { result, rerender } = renderHook(
      ({ dep }) => useChatAutoScroll({ streaming: true, hasMore: false, bottomThreshold: 80, deps: [dep] }),
      { initialProps: { dep: 1 } },
    );
    assignRef(result, el);

    act(() => result.current.onScroll());
    rerender({ dep: 2 });
    expect(getScrollTop()).toBe(820);
  });

  test("given scrollToBottom then rerender, then scrollTop is set to scrollHeight", () => {
    const { el, getScrollTop } = mockScrollDiv({ scrollHeight: 2000, clientHeight: 100, initialScrollTop: 0 });

    const { result, rerender } = renderHook(() =>
      useChatAutoScroll({ streaming: false, hasMore: false }),
    );
    assignRef(result, el);

    act(() => result.current.scrollToBottom());
    rerender();
    expect(getScrollTop()).toBe(2000);
  });

  test("given scrollToBottom without ref, then does not throw", () => {
    const { result, rerender } = renderHook(() =>
      useChatAutoScroll({ streaming: false, hasMore: false }),
    );
    act(() => result.current.scrollToBottom());
    expect(() => rerender()).not.toThrow();
  });

  test("given streaming and near bottom, when deps change, then scrolls to bottom", () => {
    const { el, getScrollTop } = mockScrollDiv({ scrollHeight: 2000, clientHeight: 100, initialScrollTop: 1850 });

    const { result, rerender } = renderHook(
      ({ dep }) => useChatAutoScroll({ streaming: true, hasMore: false, deps: [dep] }),
      { initialProps: { dep: 1 } },
    );
    assignRef(result, el);

    act(() => result.current.onScroll());
    rerender({ dep: 2 });
    expect(getScrollTop()).toBe(2000);
  });

  test("given streaming but NOT near bottom, when deps change, then does NOT scroll", () => {
    const { el, getScrollTop } = mockScrollDiv({ scrollHeight: 2000, clientHeight: 100, initialScrollTop: 200 });

    const { result, rerender } = renderHook(
      ({ dep }) => useChatAutoScroll({ streaming: true, hasMore: false, deps: [dep] }),
      { initialProps: { dep: 1 } },
    );
    assignRef(result, el);

    act(() => result.current.onScroll());
    rerender({ dep: 2 });
    expect(getScrollTop()).toBe(200);
  });

  test("given not streaming, when deps change, then does NOT auto-scroll", () => {
    const { el, getScrollTop } = mockScrollDiv({ scrollHeight: 2000, clientHeight: 100, initialScrollTop: 1900 });

    const { result, rerender } = renderHook(
      ({ dep }) => useChatAutoScroll({ streaming: false, hasMore: false, deps: [dep] }),
      { initialProps: { dep: 1 } },
    );
    assignRef(result, el);
    act(() => result.current.onScroll());

    rerender({ dep: 2 });
    expect(getScrollTop()).toBe(1900);
  });

  test("given no ref element, then onScroll does not throw", () => {
    const { result } = renderHook(() =>
      useChatAutoScroll({ streaming: false, hasMore: false }),
    );
    expect(() => act(() => result.current.onScroll())).not.toThrow();
  });
});
