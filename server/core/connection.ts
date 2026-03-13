import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import type { EventBus } from "./bus";
import type { BusEventMap } from "./bus";
import type { Logger } from "../logger.types";
import { API, NOTIFIABLE } from "./connection.api";

interface WsData {
  id: string;
  authenticated: boolean;
}

export class Connection {
  private token: string;
  private httpServer!: HttpServer;
  private wss!: WebSocketServer;
  private clients = new Map<string, { ws: WebSocket; data: WsData }>();
  private log;
  private nextId = 0;
  private _port = 0;

  constructor(private bus: EventBus, token: string, log: Logger) {
    this.token = token;
    this.log = log;
  }

  get port(): number {
    return this._port;
  }

  start(): Promise<number> {
    this.httpServer = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Sparky Sidecar");
    });

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on("connection", (ws) => {
      const id = `ws_${++this.nextId}`;
      const data: WsData = { id, authenticated: false };
      this.clients.set(id, { ws, data });
      this.log.debug(`Client ${id} connected (${this.clients.size} total)`);

      // Kick if not authenticated within 5 seconds
      const authTimeout = setTimeout(() => {
        if (!data.authenticated && this.clients.has(id)) {
          this.log.warn(`Client ${id} auth timeout, closing`);
          ws.close();
        }
      }, 5000);

      ws.on("message", (raw) => {
        this.onMessage(id, data, ws, raw.toString());
      });

      ws.on("close", () => {
        clearTimeout(authTimeout);
        this.clients.delete(id);
        this.log.info(`Client ${id} disconnected (${this.clients.size} remaining)`);
      });
    });

    return new Promise<number>((resolve) => {
      this.httpServer.listen(0, "127.0.0.1", () => {
        const addr = this.httpServer.address();
        this._port = typeof addr === "object" && addr ? addr.port : 0;
        this.log.info(`WS server listening on port ${this._port}`);
        resolve(this._port);
      });
    });
  }

  private async onMessage(id: string, data: WsData, ws: WebSocket, raw: string) {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      ws.send(JSON.stringify({ ok: false, error: "Invalid JSON" }));
      return;
    }

    if (parsed.type === "auth") {
      if (parsed.token === this.token) {
        data.authenticated = true;
        ws.send(JSON.stringify({ type: "auth_ok" }));
        this.log.info(`Client ${id} authenticated (${this.clients.size} active)`);
      } else {
        this.log.warn(`Client ${id} auth failed`);
        ws.send(JSON.stringify({ type: "auth_fail" }));
        ws.close();
      }
      return;
    }

    if (!data.authenticated) {
      ws.send(JSON.stringify({ ok: false, error: "Not authenticated" }));
      return;
    }

    const { id: msgId, route, payload, notify, message, expire } = parsed;
    if (!route || !route.includes(".")) {
      ws.send(JSON.stringify({ id: msgId, ok: false, error: "Invalid route format" }));
      return;
    }

    if (!API.has(route as keyof BusEventMap)) {
      this.log.warn(`Client ${id} tried forbidden route: ${route}`);
      ws.send(JSON.stringify({ id: msgId, route, ok: false, error: "Route not allowed" }));
      return;
    }

    const toastify = notify && message && NOTIFIABLE.has(route as keyof BusEventMap);

    try {
      const result = await this.bus.emit(route as keyof BusEventMap, payload ?? {});
      ws.send(JSON.stringify({ id: msgId, route, ok: true, data: result }));
      if (toastify) ws.send(JSON.stringify({ type: "toast", kind: "success", title: message, expire }));
    } catch (err: any) {
      ws.send(JSON.stringify({ id: msgId, route, ok: false, error: err.message }));
      if (toastify) ws.send(JSON.stringify({ type: "toast", kind: "error", title: message, message: err.message, expire }));
    }
  }

  stop(): void {
    this.log.info("Stopping WS server");
    for (const [, { ws }] of this.clients) ws.close();
    this.clients.clear();
    this.wss?.close();
    this.httpServer?.close();
  }

  broadcast(route: string, data: any, silent = false) {
    const msg = JSON.stringify({ route, ok: true, data });
    for (const [, { ws, data: d }] of this.clients) {
      if (d.authenticated && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
    if (!silent) {
      const subType = data?.type ? `${route}.${data.type}` : route;
      this.log.debug(`Broadcast "${subType}" to ${this.clients.size} client(s)`);
    }
  }
}
