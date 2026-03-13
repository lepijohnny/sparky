type Status = "connected" | "disconnected";
type StatusCallback = (status: Status) => void;
type MessageCallback = (msg: any) => void;

const REQUEST_TIMEOUT = 10000;
const RECONNECT_DELAY = 2000;

/**
 * A single managed WebSocket connection.
 * Handles auth, reconnect, and request/response.
 */
export class WsConnection {
  private ws: WebSocket | null = null;
  private status: Status = "disconnected";
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reqId = 0;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private statusListeners = new Set<StatusCallback>();
  private messageListeners = new Set<MessageCallback>();

  private port: number;
  private token: string;

  constructor(port: number, token: string) {
    this.port = port;
    this.token = token;
  }

  /**
   * Open the connection. Resolves when authenticated.
   * Rejects if auth fails within timeout.
   */
  open(timeout = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Connection timeout"));
      }, timeout);

      const unsub = this.onStatus((s) => {
        if (s === "connected") {
          clearTimeout(timer);
          unsub();
          resolve();
        }
      });

      this.doConnect();
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.clearReconnect();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
    this.rejectAll("Destroyed");
    this.setStatus("disconnected");
    this.statusListeners.clear();
    this.messageListeners.clear();
  }

  onStatus(cb: StatusCallback): () => void {
    this.statusListeners.add(cb);
    cb(this.status);
    return () => { this.statusListeners.delete(cb); };
  }

  onMessage(cb: MessageCallback): () => void {
    this.messageListeners.add(cb);
    return () => { this.messageListeners.delete(cb); };
  }

  request<T = any>(route: string, payload?: any, opts?: { notify?: boolean; message?: string; expire?: boolean; timeout?: number }): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.status !== "connected") {
        return reject(new Error("Not connected"));
      }
      const id = `req_${++this.reqId}`;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, route, payload, notify: opts?.notify, message: opts?.message, expire: opts?.expire }));

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Request timeout: ${route}`));
        }
      }, opts?.timeout ?? REQUEST_TIMEOUT);
    });
  }

  send(msg: any): void {
    if (this.ws && this.status === "connected") {
      this.ws.send(JSON.stringify(msg));
    }
  }

  subscribe<T = any>(route: string, handler: (data: T) => void): () => void {
    const cb = (msg: any) => {
      if (msg?.route === route) handler(msg.data as T);
    };
    return this.onMessage(cb);
  }

  getStatus(): Status { return this.status; }
  getPort(): number { return this.port; }

  private doConnect(): void {
    this.clearReconnect();
    if (this.destroyed) return;

    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }

    const ws = new WebSocket(`ws://127.0.0.1:${this.port}`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", token: this.token }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === "auth_ok") {
          this.setStatus("connected");
          return;
        }
        if (msg.type === "auth_fail") {
          console.error("WS auth failed");
          ws.close();
          return;
        }

        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.ok) resolve(msg.data);
          else reject(new Error(msg.error || "Unknown error"));
          return;
        }

        for (const cb of this.messageListeners) cb(msg);
      } catch {}
    };

    ws.onclose = () => {
      this.setStatus("disconnected");
      this.rejectAll("Connection lost");
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.doConnect(), RECONNECT_DELAY);
      }
    };

    ws.onerror = () => ws.close();

    this.ws = ws;
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: Status): void {
    if (this.status === status) return;
    this.status = status;
    for (const cb of this.statusListeners) cb(status);
  }

  private rejectAll(reason: string): void {
    for (const [, { reject }] of this.pending) reject(new Error(reason));
    this.pending.clear();
  }
}

/**
 * Creates and manages WsConnection instances.
 * Tracks all connections for cleanup.
 */
class WsFactory {
  private connections = new Set<WsConnection>();

  async create(port: number, token: string, timeout = 5000): Promise<WsConnection> {
    const conn = new WsConnection(port, token);
    this.connections.add(conn);
    await conn.open(timeout);
    return conn;
  }

  destroy(conn: WsConnection): void {
    conn.destroy();
    this.connections.delete(conn);
  }

  destroyAll(): void {
    for (const conn of this.connections) conn.destroy();
    this.connections.clear();
  }
}

export const wsFactory = new WsFactory();
