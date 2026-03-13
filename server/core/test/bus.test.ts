import { describe, test, expect } from "vitest";
import { createEventBus, type EventBus } from "../bus";
import { noopLogger } from "../../logger";

function createBus(): EventBus {
  return createEventBus(noopLogger);
}

describe("on and emit", () => {
  test("given registered handler, when event is emitted, then handler receives data", async () => {
    const bus = createBus();
    let received: any = null;
    bus.on("storage.ready", () => { received = true; });
    await bus.emit("storage.ready");
    expect(received).toBe(true);
  });

  test("given handler with payload, when event is emitted with data, then handler receives it", async () => {
    const bus = createBus();
    let received: any = null;
    bus.on("settings.appearance.theme.set", (data) => {
      received = data;
      return { theme: {} } as any;
    });
    await bus.emit("settings.appearance.theme.set", { name: "dracula" });
    expect(received).toEqual({ name: "dracula" });
  });

  test("given duplicate handler on same event, then throws", () => {
    const bus = createBus();
    bus.on("storage.ready", () => {});
    expect(() => bus.on("storage.ready", () => {})).toThrow(/Duplicate handler/);
  });
});

describe("return value", () => {
  test("given handler that returns data, when event is emitted, then emit resolves with that data", async () => {
    const bus = createBus();
    bus.on("settings.appearance.theme.list", () => ({ themes: [{ name: "dark" }] } as any));
    const result: any = await bus.emit("settings.appearance.theme.list");
    expect(result).toEqual({ themes: [{ name: "dark" }] });
  });
});

describe("no listeners", () => {
  test("given no registered listeners, when event is emitted, then returns undefined", async () => {
    const bus = createBus();
    const result: any = await bus.emit("storage.ready");
    expect(result).toBeUndefined();
  });
});

describe("unsubscribe", () => {
  test("given unsubscribed handler, when event is emitted, then handler is not called", async () => {
    const bus = createBus();
    let called = false;
    const unsub = bus.on("storage.ready", () => { called = true; });
    unsub();
    await bus.emit("storage.ready");
    expect(called).toBe(false);
  });

  test("given unsubscribed handler, then a new handler can be registered", async () => {
    const bus = createBus();
    const unsub = bus.on("storage.ready", () => {});
    unsub();
    let called = false;
    bus.on("storage.ready", () => { called = true; });
    await bus.emit("storage.ready");
    expect(called).toBe(true);
  });
});

describe("error handling", () => {
  test("given handler that throws, when event is emitted, then error is re-thrown", async () => {
    const bus = createBus();
    bus.on("storage.ready", () => { throw new Error("boom"); });
    expect(bus.emit("storage.ready")).rejects.toThrow("boom");
  });
});

describe("async handlers", () => {
  test("given async handler, when event is emitted, then emit awaits the result", async () => {
    const bus = createBus();
    bus.on("settings.appearance.theme.list", async () => {
      await new Promise((r) => setTimeout(r, 10));
      return { themes: [{ name: "async" }] } as any;
    });
    const result: any = await bus.emit("settings.appearance.theme.list");
    expect(result).toEqual({ themes: [{ name: "async" }] });
  });

  test("given async handler that rejects, when event is emitted, then error is re-thrown", async () => {
    const bus = createBus();
    bus.on("storage.ready", async () => { throw new Error("async boom"); });
    expect(bus.emit("storage.ready")).rejects.toThrow("async boom");
  });
});

describe("subscribe (fan-out)", () => {
  test("given multiple subscribers, when event is emitted, then all are called", async () => {
    const bus = createBus();
    const calls: number[] = [];
    bus.on("storage.ready", () => { calls.push(0); });
    bus.subscribe("storage.ready", () => { calls.push(1); });
    bus.subscribe("storage.ready", () => { calls.push(2); });
    await bus.emit("storage.ready");
    expect(calls).toEqual([0, 1, 2]);
  });

  test("given subscriber, when event is emitted, subscriber return value is ignored", async () => {
    const bus = createBus();
    bus.on("settings.appearance.theme.list", () => ({ themes: [{ name: "handler" }] } as any));
    bus.subscribe("settings.appearance.theme.list", () => { /* side effect */ });
    const result: any = await bus.emit("settings.appearance.theme.list");
    expect(result).toEqual({ themes: [{ name: "handler" }] });
  });

  test("given subscriber that throws, then other subscribers still run", async () => {
    const bus = createBus();
    let secondCalled = false;
    bus.subscribe("storage.ready", () => { throw new Error("sub boom"); });
    bus.subscribe("storage.ready", () => { secondCalled = true; });
    await bus.emit("storage.ready");
    expect(secondCalled).toBe(true);
  });

  test("given unsubscribed subscriber, when event is emitted, then subscriber is not called", async () => {
    const bus = createBus();
    let called = false;
    const unsub = bus.subscribe("storage.ready", () => { called = true; });
    unsub();
    await bus.emit("storage.ready");
    expect(called).toBe(false);
  });

  test("given only subscribers (no handler), when event is emitted, then subscribers run and result is undefined", async () => {
    const bus = createBus();
    let called = false;
    bus.subscribe("storage.ready", () => { called = true; });
    const result = await bus.emit("storage.ready");
    expect(called).toBe(true);
    expect(result).toBeUndefined();
  });
});
