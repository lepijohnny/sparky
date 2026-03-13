import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { WsConnection } from "../../lib/ws";
import { useWsSubscriber } from "../useWsSubscriber";
import { mockConn } from "./mockWs.mock";

describe("useWsSubscriber", () => {
  test("calls callback when matching route is broadcast", () => {
    const conn = mockConn();
    const cb = vi.fn();

    renderHook(() =>
      useWsSubscriber(conn as unknown as WsConnection, "chat.event", cb),
    );

    act(() => conn.broadcast("chat.event", { id: 1 }));

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith({ id: 1 });
  });

  test("ignores broadcasts for other routes", () => {
    const conn = mockConn();
    const cb = vi.fn();

    renderHook(() =>
      useWsSubscriber(conn as unknown as WsConnection, "chat.event", cb),
    );

    act(() => conn.broadcast("other.route", { id: 2 }));

    expect(cb).not.toHaveBeenCalled();
  });

  test("receives multiple broadcasts", () => {
    const conn = mockConn();
    const cb = vi.fn();

    renderHook(() =>
      useWsSubscriber(conn as unknown as WsConnection, "test.route", cb),
    );

    act(() => {
      conn.broadcast("test.route", { n: 1 });
      conn.broadcast("test.route", { n: 2 });
      conn.broadcast("test.route", { n: 3 });
    });

    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenNthCalledWith(1, { n: 1 });
    expect(cb).toHaveBeenNthCalledWith(2, { n: 2 });
    expect(cb).toHaveBeenNthCalledWith(3, { n: 3 });
  });

  test("unsubscribes on unmount", () => {
    const conn = mockConn();
    const cb = vi.fn();

    const { unmount } = renderHook(() =>
      useWsSubscriber(conn as unknown as WsConnection, "chat.event", cb),
    );

    act(() => conn.broadcast("chat.event", { before: true }));
    expect(cb).toHaveBeenCalledTimes(1);

    unmount();

    act(() => conn.broadcast("chat.event", { after: true }));
    expect(cb).toHaveBeenCalledTimes(1); // no new call
  });

  test("does nothing when conn is null", () => {
    const cb = vi.fn();

    // Should not throw
    const { unmount } = renderHook(() =>
      useWsSubscriber(null, "chat.event", cb),
    );

    expect(cb).not.toHaveBeenCalled();
    unmount();
  });

  test("resubscribes when route changes", () => {
    const conn = mockConn();
    const cb = vi.fn();

    const { rerender } = renderHook(
      ({ route }) => useWsSubscriber(conn as unknown as WsConnection, route, cb),
      { initialProps: { route: "route.a" } },
    );

    act(() => conn.broadcast("route.a", { v: 1 }));
    expect(cb).toHaveBeenCalledTimes(1);

    rerender({ route: "route.b" });

    act(() => conn.broadcast("route.a", { v: 2 })); // old route
    expect(cb).toHaveBeenCalledTimes(1); // not called again

    act(() => conn.broadcast("route.b", { v: 3 })); // new route
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenLastCalledWith({ v: 3 });
  });

  test("resubscribes when conn changes", () => {
    const conn1 = mockConn();
    const conn2 = mockConn();
    const cb = vi.fn();

    const { rerender } = renderHook(
      ({ conn }) => useWsSubscriber(conn as unknown as WsConnection, "test", cb),
      { initialProps: { conn: conn1 } },
    );

    act(() => conn1.broadcast("test", { from: 1 }));
    expect(cb).toHaveBeenCalledTimes(1);

    rerender({ conn: conn2 });

    act(() => conn1.broadcast("test", { from: 1 })); // old conn
    expect(cb).toHaveBeenCalledTimes(1);

    act(() => conn2.broadcast("test", { from: 2 })); // new conn
    expect(cb).toHaveBeenCalledTimes(2);
  });
});
