import { describe, test, expect, beforeEach, vi, afterEach } from "vitest";
import { createSvcCrud } from "../chat.service";
import { createEventBus, type EventBus } from "../../core/bus";
import type { Configuration } from "../../core/config";
import type { Logger } from "../../logger.types";
import type { Credentials } from "../../core/cred";
import type { ServiceDef } from "../../core/proxy/proxy.schema";

const mockCred: Credentials = {
  init: async () => {},
  get: async (key: string) => key === "svc.test_svc.TOKEN" ? "test-token" : null,
  set: async () => {},
  delete: async () => {},
  deletePrefix: async () => {},
  keys: () => [],
  svcKey: (s, f) => `svc.${s}.${f}`,
  deleteSvc: async () => {},
};

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

function makeConfig(): Configuration & { data: Record<string, any> } {
  const data: Record<string, any> = {};
  return {
    data,
    read() { return data; },
    get(key: string) { return data[key]; },
    async update(key: string, fn: (current: any) => any) {
      data[key] = fn(data[key]);
    },
    async set(key: string, value: any) {
      data[key] = value;
    },
  } as any;
}

function makeDef(overrides?: Partial<ServiceDef>): ServiceDef {
  return {
    id: "test_svc",
    label: "Test Service",
    baseUrl: "https://api.example.com",
    auth: { strategy: "bearer", secretRef: "${svc.test_svc.TOKEN}" },
    endpoints: [
      {
        name: "get_user",
        description: "Get the authenticated user profile",
        input: {},
        output: {},
        transport: { type: "rest", method: "GET", path: "/user", body: "json" },
        secretRefs: [],
        status: "unvalidated",
      },
    ],
    ...overrides,
  } as ServiceDef;
}

describe("chat.service", () => {
  let bus: EventBus;
  let config: ReturnType<typeof makeConfig>;
  let broadcasts: { route: string; data: any }[];
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    bus = createEventBus(noopLogger);
    config = makeConfig();
    broadcasts = [];
    for (const route of ["svc.register", "svc.test", "svc.delete", "svc.guide"] as const) {
      bus.subscribe(route, (data: any) => { broadcasts.push({ route, data }); });
    }
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test("given svc.register, when valid def, then service is staged but not saved to config", async () => {
    createSvcCrud(bus, config, noopLogger, mockCred);

    await bus.emit("svc.register", makeDef());

    expect(config.data.services).toBeUndefined();
  });

  test("given svc.register, when invalid def, then throws validation error", async () => {
    createSvcCrud(bus, config, noopLogger, mockCred);

    await expect(bus.emit("svc.register", { id: "Bad-Name", label: "X", baseUrl: "not-url" } as any))
      .rejects.toThrow("Invalid params");
  });

  test("given staged service, when svc.list called, then staged service is not in list", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    createSvcCrud(bus, config, noopLogger, mockCred);

    await bus.emit("svc.register", makeDef());
    const result = await bus.emit("svc.list");

    expect(result.services).toHaveLength(0);
  });

  test("given valid service, when svc.register passes auto-test, then service is saved to config", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"login":"user"}', { status: 200 }));
    createSvcCrud(bus, config, noopLogger, mockCred);

    const result = await bus.emit("svc.register", makeDef());

    expect(result.status).toBe("registered");
    expect(result.tested).toBe(true);
    expect(config.data.services).toHaveLength(1);
    expect(config.data.services[0].id).toBe("test_svc");
  });

  test("given valid service, when svc.register auto-test fails, then service stays staged", async () => {
    fetchSpy.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    createSvcCrud(bus, config, noopLogger, mockCred);

    const result = await bus.emit("svc.register", makeDef());

    expect(result.status).toBe("registered");
    expect(result.tested).toBe(false);
    expect(result.error).toContain("Auto-test");
    expect(config.data.services).toBeUndefined();
  });

  test("given no service registered, when svc.test called, then returns deprecation error", async () => {
    createSvcCrud(bus, config, noopLogger, mockCred);

    const result = await bus.emit("svc.test", { service: "nonexistent" });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("given staged and saved services, when svc.list called, then returns only saved", async () => {
    config.data.services = [makeDef({ id: "saved_svc", label: "Saved" })];
    createSvcCrud(bus, config, noopLogger, mockCred);

    await bus.emit("svc.register", makeDef({ id: "staged_svc", label: "Staged" }));
    const result = await bus.emit("svc.list");

    expect(result.services).toHaveLength(1);
    expect((result.services[0] as any).id).toBe("saved_svc");
  });

  test("given svc.call with valid service, when endpoint exists, then makes fetch and returns result", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"login":"user"}', { status: 200 }));
    config.data.services = [makeDef()];
    createSvcCrud(bus, config, noopLogger, mockCred);

    const result = await bus.emit("svc.call", { service: "test_svc", action: "get_user" });

    expect(result).toContain("user");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/user",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("given svc.call with params as 'input', when called, then extracts params correctly", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    config.data.services = [makeDef({
      endpoints: [{
        name: "get_item",
        description: "Get an item by id",
        input: { id: { type: "string" } },
        output: {},
        transport: { type: "rest", method: "GET", path: "/items/{id}", body: "json" },
        secretRefs: [],
        status: "unvalidated",
      }],
    })];
    createSvcCrud(bus, config, noopLogger, mockCred);

    await bus.emit("svc.call", { service: "test_svc", action: "get_item", input: { id: "123" } } as any);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/items/123",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("given svc.call with params as 'arguments', when called, then extracts params correctly", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    config.data.services = [makeDef({
      endpoints: [{
        name: "get_item",
        description: "Get an item by id",
        input: { id: { type: "string" } },
        output: {},
        transport: { type: "rest", method: "GET", path: "/items/{id}", body: "json" },
        secretRefs: [],
        status: "unvalidated",
      }],
    })];
    createSvcCrud(bus, config, noopLogger, mockCred);

    await bus.emit("svc.call", { service: "test_svc", action: "get_item", arguments: { id: "456" } } as any);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/items/456",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("given svc.call with params as array, when called, then throws validation error", async () => {
    config.data.services = [makeDef()];
    createSvcCrud(bus, config, noopLogger, mockCred);

    await expect(bus.emit("svc.call", { service: "test_svc", action: "get_user", params: ["bad"] } as any))
      .rejects.toThrow("Invalid params");
  });

  test("given svc.call with no params field, when called, then uses empty params", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"login":"user"}', { status: 200 }));
    config.data.services = [makeDef()];
    createSvcCrud(bus, config, noopLogger, mockCred);

    const result = await bus.emit("svc.call", { service: "test_svc", action: "get_user" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/user",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("given svc.call with flat params, when called, then collects loose keys as params", async () => {
    fetchSpy.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    config.data.services = [makeDef({
      endpoints: [{
        name: "get_item",
        description: "Get an item by id",
        input: { id: { type: "string" } },
        output: {},
        transport: { type: "rest", method: "GET", path: "/items/{id}", body: "json" },
        secretRefs: [],
        status: "unvalidated",
      }],
    })];
    createSvcCrud(bus, config, noopLogger, mockCred);

    await bus.emit("svc.call", { service: "test_svc", action: "get_item", id: "789" } as any);

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.example.com/items/789",
      expect.objectContaining({ method: "GET" }),
    );
  });

  test("given svc.call with unknown service, when called, then returns not registered error", async () => {
    createSvcCrud(bus, config, noopLogger, mockCred);

    const result = await bus.emit("svc.call", { service: "unknown", action: "get_user" });

    expect(result).toContain("not registered");
  });

  test("given svc.delete, when service exists, then removes from config and clears credentials", async () => {
    config.data.services = [makeDef()];
    const cred = { ...mockCred, deleteSvc: vi.fn() };
    createSvcCrud(bus, config, noopLogger, cred);

    await bus.emit("svc.delete", { service: "test_svc" });

    expect(config.data.services).toHaveLength(0);
    expect(cred.deleteSvc).toHaveBeenCalledWith("test_svc");
  });
});
