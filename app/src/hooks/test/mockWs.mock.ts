

type MessageCallback = (msg: any) => void;

/**
 * Minimal mock of WsConnection for hook testing.
 * - `request()` returns from a configurable handler
 * - `broadcast()` simulates a server push to all `onMessage` listeners
 */
export class MockWsConnection {
  private messageListeners = new Set<MessageCallback>();
  private requestHandler: (route: string, payload?: any) => any = () => ({});

  onMessage(cb: MessageCallback): () => void {
    this.messageListeners.add(cb);
    return () => { this.messageListeners.delete(cb); };
  }

  onStatus(cb: (status: string) => void): () => void {
    cb("connected");
    return () => {};
  }

  request<T = any>(route: string, payload?: any): Promise<T> {
    return Promise.resolve(this.requestHandler(route, payload));
  }

  send(): void {}
  getStatus(): string { return "connected"; }
  getPort(): number { return 0; }
  open(): Promise<void> { return Promise.resolve(); }
  destroy(): void { this.messageListeners.clear(); }


  /** Set the handler for `request()` calls */
  onRequest(handler: (route: string, payload?: any) => any): void {
    this.requestHandler = handler;
  }

  /** Simulate a server broadcast */
  broadcast(route: string, data: any): void {
    const msg = { route, data };
    for (const cb of this.messageListeners) cb(msg);
  }
}

/** Cast to WsConnection for use in hooks */
export function mockConn(): MockWsConnection {
  return new MockWsConnection();
}
