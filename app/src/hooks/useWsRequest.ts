import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { WsConnection } from "../lib/ws";

interface UseWsRequestResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Request-response data fetching over the WebSocket connection.
 *
 * Sends a single request to the server on mount (and whenever `route`,
 * `payload`, or `deps` change), then exposes `{ data, loading, error }`.
 * Also provides a `refresh()` to manually re-fetch.
 *
 * If `refreshOn` is provided, the hook subscribes to those WS notification
 * routes and auto-refetches when any of them fire.
 *
 * @param conn - WebSocket connection (null-safe, skips fetch if null)
 * @param route - Bus event route to call
 * @param payload - Optional request payload
 * @param deps - Additional dependencies that trigger a re-fetch
 * @param refreshOn - Optional list of notification routes that trigger auto-refresh
 */
export function useWsRequest<T>(
  conn: WsConnection | null,
  route: string,
  payload?: unknown,
  deps: unknown[] = [],
  refreshOn?: string[],
): UseWsRequestResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!conn);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetch = useCallback(async () => {
    if (!conn) return;
    setLoading(true);
    setError(null);
    try {
      const res = await conn.request<T>(route, payloadRef.current);
      if (mountedRef.current) {
        setData(res);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [conn, route, ...deps]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  useEffect(() => {
    if (!conn || !refreshOn?.length) return;
    const routes = new Set(refreshOn);
    return conn.onMessage((msg: any) => {
      if (msg?.route && routes.has(msg.route)) fetch();
    });
  }, [conn, fetch, ...(refreshOn ?? [])]);

  return { data, loading, error, refresh: fetch };
}
