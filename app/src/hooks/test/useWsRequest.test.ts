import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { WsConnection } from "../../lib/ws";
import { useWsRequest } from "../useWsRequest";
import { mockConn } from "./mockWs.mock";

describe("useWsRequest", () => {
  test("starts loading when conn is provided", () => {
    const conn = mockConn();
    conn.onRequest(() => ({ value: 1 }));
    const { result } = renderHook(() =>
      useWsRequest(conn as unknown as WsConnection, "test.route"),
    );
    expect(result.current.loading).toBe(true);
  });

  test("does not load when conn is null", () => {
    const { result } = renderHook(() =>
      useWsRequest(null, "test.route"),
    );
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  test("fetches data on mount", async () => {
    const conn = mockConn();
    conn.onRequest((route) => {
      if (route === "test.data") return { items: [1, 2, 3] };
    });

    const { result } = renderHook(() =>
      useWsRequest<{ items: number[] }>(conn as unknown as WsConnection, "test.data"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ items: [1, 2, 3] });
    expect(result.current.error).toBeNull();
  });

  test("passes payload to request", async () => {
    const conn = mockConn();
    const spy = vi.fn(() => ({ ok: true }));
    conn.onRequest(spy);

    const { result } = renderHook(() =>
      useWsRequest(conn as unknown as WsConnection, "test.route", { id: "abc" }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledWith("test.route", { id: "abc" });
  });

  test("sets error on request failure", async () => {
    const conn = mockConn();
    conn.onRequest(() => { throw new Error("Connection failed"); });

    const { result } = renderHook(() =>
      useWsRequest(conn as unknown as WsConnection, "test.route"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe("Connection failed");
  });

  test("re-fetches when deps change", async () => {
    const conn = mockConn();
    let counter = 0;
    conn.onRequest(() => ({ count: ++counter }));

    const { result, rerender } = renderHook(
      ({ dep }) => useWsRequest<{ count: number }>(conn as unknown as WsConnection, "test.route", undefined, [dep]),
      { initialProps: { dep: "a" } },
    );

    await waitFor(() => expect(result.current.data?.count).toBe(1));

    rerender({ dep: "b" });
    await waitFor(() => expect(result.current.data?.count).toBe(2));
  });

  test("refresh re-fetches data", async () => {
    const conn = mockConn();
    let counter = 0;
    conn.onRequest(() => ({ count: ++counter }));

    const { result } = renderHook(() =>
      useWsRequest<{ count: number }>(conn as unknown as WsConnection, "test.route"),
    );

    await waitFor(() => expect(result.current.data?.count).toBe(1));

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => expect(result.current.data?.count).toBe(2));
  });

  test("ignores stale response after unmount", async () => {
    const conn = mockConn();
    let resolve: (v: any) => void;
    conn.onRequest(() => new Promise((r) => { resolve = r; }));

    const { result, unmount } = renderHook(() =>
      useWsRequest<{ value: number }>(conn as unknown as WsConnection, "test.route"),
    );

    expect(result.current.loading).toBe(true);
    unmount();

    await act(async () => { resolve!({ value: 42 }); });
    expect(result.current.data).toBeNull();
  });

  test("handles non-Error thrown as string error", async () => {
    const conn = mockConn();
    conn.onRequest(() => { throw "string error"; });

    const { result } = renderHook(() =>
      useWsRequest(conn as unknown as WsConnection, "test.route"),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("string error");
    expect(result.current.data).toBeNull();
  });

  test("re-fetches when route changes", async () => {
    const conn = mockConn();
    conn.onRequest((route) => ({ route }));

    const { result, rerender } = renderHook(
      ({ route }) => useWsRequest<{ route: string }>(conn as unknown as WsConnection, route),
      { initialProps: { route: "route.a" } },
    );

    await waitFor(() => expect(result.current.data?.route).toBe("route.a"));

    rerender({ route: "route.b" });
    await waitFor(() => expect(result.current.data?.route).toBe("route.b"));
  });
});
