import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { type WsConnection, wsFactory } from "../lib/ws";
import { syncStore } from "../store/sync";

interface ConnectionContextValue {
  conn: WsConnection | null;
  wsStatus: "connected" | "disconnected";
  wsPort: number | null;
  sidecarToken: string | null;
  openLogs: () => void;
  reconnect: () => void;
}

/** Exported for test wrappers — prefer useConnection() in app code */
export const Ctx = createContext<ConnectionContextValue>({
  conn: null,
  wsStatus: "disconnected",
  wsPort: null,
  sidecarToken: null,
  openLogs: () => {},
  reconnect: () => {},
});

export const useConnection = () => useContext(Ctx);

export default function ConnectionContext({ children }: { children: React.ReactNode }) {
  const [wsStatus, setWsStatus] = useState<"connected" | "disconnected">("disconnected");
  const [wsPort, setWsPort] = useState<number | null>(null);
  const [sidecarToken, setSidecarToken] = useState<string | null>(null);
  const [conn, setConn] = useState<WsConnection | null>(null);
  const [connectTrigger, setConnectTrigger] = useState(0);
  const connRef = useRef<WsConnection | null>(null);

  const reconnect = useCallback(() => {
    setConnectTrigger((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!window.__TAURI_INTERNALS__) return;

      if (connRef.current) {
        wsFactory.destroy(connRef.current);
        connRef.current = null;
        setConn(null);
        setWsStatus("disconnected");
      }

      try {
        const info: { port: number; token: string } = await invoke("get_sidecar_info");
        if (cancelled) return;
        setSidecarToken(info.token);
        setWsPort(info.port);
        const c = await wsFactory.create(info.port, info.token);
        if (cancelled) { wsFactory.destroy(c); return; }
        connRef.current = c;
        setConn(c);
        setWsStatus("connected");
        const unsyncStore = syncStore(c);
        c.onStatus((s) => {
          if (!cancelled) setWsStatus(s);
          if (s === "disconnected") unsyncStore();
        });
      } catch (err) {
        console.error("Failed to connect:", err);
      }
    })();
    return () => {
      cancelled = true;
      if (connRef.current) {
        wsFactory.destroy(connRef.current);
        connRef.current = null;
        setConn(null);
      }
    };
  }, [connectTrigger]);

  const openLogs = useCallback(async () => {
    if (window.__TAURI_INTERNALS__) {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const { Window } = await import("@tauri-apps/api/window");
      const existing = await Window.getByLabel("logs");
      if (existing) {
        await existing.show();
        await existing.unminimize();
        await existing.setFocus();
        return;
      }
      const saved = localStorage.getItem("sparky-theme");
      const theme = saved ? JSON.parse(saved) : {};
      const params = new URLSearchParams();
      if (theme.bg) params.set("bg", theme.bg);
      if (theme.fg) params.set("fg", theme.fg);
      if (theme.accent) params.set("accent", theme.accent);
      new WebviewWindow("logs", {
        url: `/logs.html?${params.toString()}`,
        title: "Sparky — Logs",
        width: 900, height: 600, resizable: true, decorations: true,
      });
    }
  }, []);

  return (
    <Ctx.Provider value={{ conn, wsStatus, wsPort, sidecarToken, openLogs, reconnect }}>
      {children}
    </Ctx.Provider>
  );
}
