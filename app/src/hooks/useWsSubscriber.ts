import { useEffect, useRef } from "react";
import type { WsConnection } from "../lib/ws";

/**
 * Server-push event listener over the WebSocket connection.
 *
 * Subscribes to broadcast messages matching a specific `route` and invokes
 * `callback` for each. Automatically unsubscribes on unmount or when
 * `conn` / `route` changes. Used by chat event streams, label/chat CRUD
 * listeners, and workspace change detection.
 *
 * Uses a ref for the callback so the latest closure is always invoked
 * without needing to re-subscribe on every callback change.
 *
 * @param conn - WebSocket connection (null-safe, skips if null)
 * @param route - Broadcast route to listen for (e.g. "chat.event")
 * @param callback - Called with the message data when route matches
 * @param deps - Additional dependencies that re-create the listener
 */
export function useWsSubscriber<T = unknown>(
  conn: WsConnection | null,
  route: string,
  callback: (data: T) => void,
  deps: unknown[] = [],
): void {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    if (!conn) return;
    const unsub = conn.onMessage((msg: any) => {
      if (msg.route === route) {
        cbRef.current(msg.data as T);
      }
    });
    return unsub;
  }, [conn, route, ...deps]);
}
