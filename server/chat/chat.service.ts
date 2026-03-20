import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { Configuration } from "../core/config";
import type { EventBus } from "../core/bus";
import type { Logger } from "../logger.types";
import type { Credentials } from "../core/cred";
import { ServiceSchema, formatZodError, getDefaults, type ServiceDef } from "../core/proxy/proxy.schema";
import { createServiceRouter, listMcpTools, mcpToolsToEndpoints, summarizeMcpTools, type ServiceRouter } from "../core/proxy/proxy.router";

function normalizeMarkdown(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function servicesDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  return join(home, ".sparky", "services");
}

export function createSvcCrud(
  bus: EventBus,
  config: Configuration,
  log: Logger,
  cred: Credentials,
): void {

  const staged = new Map<string, ServiceDef>();
  const routers = new Map<string, ServiceRouter>();

  function getRouter(def: ServiceDef): ServiceRouter {
    let router = routers.get(def.id);
    if (!router) {
      router = createServiceRouter(def, cred, log);
      routers.set(def.id, router);
    }
    return router;
  }

  function disposeRouter(id: string): void {
    const router = routers.get(id);
    if (router) {
      router.dispose();
      routers.delete(id);
    }
  }

  async function resolveAuthHeaders(def: ServiceDef): Promise<Record<string, string> | null> {
    const ref = def.auth.secretRef.match(/^\$\{(.+)\}$/)?.[1] ?? def.auth.secretRef;
    const token = await cred.get(ref);
    if (!token) return null;

    switch (def.auth.strategy) {
      case "bearer":
      case "oauth":
        return { Authorization: `Bearer ${token}` };
      case "bot":
        return { Authorization: `Bot ${token}` };
      case "basic":
        return { Authorization: `Basic ${token}` };
      case "header":
        return { [(def.auth as { header: string }).header]: token };
      default:
        return {};
    }
  }

  function findDef(id: string): ServiceDef | undefined {
    return staged.get(id)
      ?? (config.get("services") ?? []).find((s) => s.id === id);
  }

  async function persistDef(def: ServiceDef): Promise<void> {
    await config.update("services", (current) => {
      const services = current ?? [];
      const idx = services.findIndex((s) => s.id === def.id);
      if (idx >= 0) services[idx] = def;
      else services.push(def);
      return services;
    });
  }

  async function refreshEndpointStatus(def: ServiceDef, name: string, ok: boolean): Promise<void> {
    const ep = def.endpoints.find((e) => e.name === name);
    if (ep) ep.status = ok ? "validated" : "failed";
    if (ok) def.lastTestedAt = Date.now();
    if (!staged.has(def.id)) {
      await persistDef(def);
      bus.emit("svc.updated", def);
    }
  }

  bus.on("svc.register", async (data) => {
    const result = ServiceSchema.safeParse(data);
    if (!result.success) {
      const errors = formatZodError(result.error);
      log.warn("Service registration failed validation", { errors });
      return { status: "error", errors };
    }

    const def = result.data as ServiceDef;

    if (def.endpoints.length === 0) {
      try {
        const headers = await resolveAuthHeaders(def);
        if (!headers) return { status: "error", errors: "Token missing from credential store." };

        const tools = await listMcpTools(def.baseUrl, headers, log);
        if (tools.length === 0) return { status: "error", errors: "MCP connected but no tools found." };

        const endpoints = mcpToolsToEndpoints(tools, def.baseUrl);
        def.endpoints = endpoints;

        const summary = summarizeMcpTools(tools);
        log.info("MCP discovery completed, auto-registered endpoints", { id: def.id, tools: tools.length });

        staged.set(def.id, def);
        disposeRouter(def.id);

        return { status: "discovered", endpointCount: endpoints.length, summary };
      } catch (err) {
        return { status: "error", errors: `MCP discovery failed: ${String(err).slice(0, 250)}` };
      }
    }

    staged.set(def.id, def);
    disposeRouter(def.id);

    log.info("Service staged", { id: def.id, endpoints: def.endpoints.length });

    const testResult = await promoteStaged(def);
    
    return { status: "registered", endpointCount: def.endpoints.length, ...testResult };
  });

  bus.on("svc.list", () => {
    const services = (config.get("services") ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      baseUrl: s.baseUrl,
      icon: s.icon,
      auth: s.auth,
      endpoints: s.endpoints.map((e) => ({
        name: e.name,
        description: e.description,
        status: e.status,
        transport: e.transport,
      })),
      lastTestedAt: s.lastTestedAt,
    }));
    log.info("Connections list", { count: services.length, ids: services.map((s) => s.id) });
    return { services };
  });

  bus.on("svc.list.compact", () => {
    const services = (config.get("services") ?? []).map((s) => ({
      id: s.id,
      label: s.label,
      baseUrl: s.baseUrl,
      auth: s.auth.strategy,
      endpointCount: s.endpoints.length,
      endpoints: s.endpoints.map((e) => {
        const input = e.input as Record<string, { type?: string; optional?: boolean }> | undefined;
        if (!input || Object.keys(input).length === 0) return e.name;
        const params = Object.entries(input).map(([k, v]) => v?.optional ? `${k}?` : k);
        return `${e.name}(${params.join(", ")})`;
      }),
    }));
    return { services };
  });

  bus.on("svc.describe", (data) => {
    const def = findDef(data.service);
    if (!def) return { error: `Service "${data.service}" not found` };

    return {
      id: def.id,
      label: def.label,
      baseUrl: def.baseUrl,
      auth: def.auth.strategy,
      endpoints: def.endpoints.map((e) => {
        const input = e.input as Record<string, { type?: string; description?: string; optional?: boolean }> | undefined;
        const params = input ? Object.fromEntries(
          Object.entries(input).map(([k, v]) => [k, {
            type: v.type ?? "string",
            ...(v.description ? { description: v.description } : {}),
            ...(v.optional ? { optional: true } : {}),
          }])
        ) : undefined;
        return {
          name: e.name,
          description: e.description,
          ...(params ? { params } : {}),
        };
      }),
    };
  });

  bus.on("svc.test", async (data) => {
    const def = findDef(data.service);
    if (!def) return { ok: false, error: `Service "${data.service}" not found.` };

    const ep = def.endpoints[0];
    if (!ep) return { ok: false, error: "No endpoints defined." };

    const result = await bus.emit("svc.call", { service: data.service, action: ep.name, params: {} });
    const ok = result.ok !== false;
    await refreshEndpointStatus(def, ep.name, ok);
    return { ok, error: ok ? undefined : (result as any).text ?? "Test failed" };
  });

  bus.on("svc.delete", async (data) => {
    staged.delete(data.service);
    disposeRouter(data.service);
    await cred.deleteSvc(data.service);

    await config.update("services", (current) => {
      const services = current ?? [];
      return services.filter((s) => s.id !== data.service);
    });

    try {
      await unlink(join(servicesDir(), `${data.service}.md`));
    } catch { /* guide may not exist */ }

    log.info("Service deleted", { service: data.service });
    return { ok: true };
  });

  bus.on("svc.guide", async (data) => {
    const dir = servicesDir();
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${data.service}.md`);

    const content = normalizeMarkdown(data.content);

    await writeFile(file, content, "utf-8");
    log.info("Service guide written", { service: data.service, path: file });
    return { ok: true };
  });

  bus.on("svc.guide.read", async (data) => {
    try {
      const file = join(servicesDir(), `${data.service}.md`);
      const content = await readFile(file, "utf-8");
      return { content };
    } catch {
      return { content: null };
    }
  });

  bus.on("svc.call", async (data) => {
    const { action, params } = normalizeCallData(data as Record<string, unknown>);
    log.info("Proxy request", { service: data.service, action, params: Object.keys(params) });
    const def = findDef(data.service);
    if (!def) {
      log.warn("Proxy: service not found", { service: data.service });
      return `Service "${data.service}" not registered. Ask the user to set it up.`;
    }

    try {
      const router = getRouter(def);
      const result = await router.call(action, params);
      if (result.ok) {
        staged.delete(data.service);
        await refreshEndpointStatus(def, action, true);
      } else {
        await refreshEndpointStatus(def, action, false);
      }
      return result.text;
    } catch (err) {
      log.error("Proxy execute failed", { service: data.service, action, error: String(err) });
      return `Error: ${String(err)}`;
    }
  });

  async function promoteStaged(def: ServiceDef): Promise<{ tested: boolean; error?: string }> {
    const testEp = findTestEndpoint(def);
    if (!testEp) return { tested: false };

    const ep = def.endpoints.find((e) => e.name === testEp);
    const testParams = getDefaults(ep?.input ?? {});
    try {
      const router = getRouter(def);
      const result = await router.call(testEp, testParams);
      if (result.ok) {
        staged.delete(def.id);
        await refreshEndpointStatus(def, testEp, true);
        log.info("Service auto-tested successfully", { id: def.id, endpoint: testEp });
        return { tested: true };
      }
      await refreshEndpointStatus(def, testEp, false);
      return { tested: false, error: `Auto-test of ${testEp} failed: ${result.text.slice(0, 300)}. Use svc.call with proper params to test.` };
    } catch (err) {
      return { tested: false, error: `Auto-test error: ${String(err).slice(0, 200)}. Use svc.call with proper params to test.` };
    }
  }
}

const ACTION_KEYS = new Set(["action", "endpoint", "target", "method", "name"]);

function normalizeCallData(raw: Record<string, unknown>): { action: string; params: Record<string, unknown> } {
  let action = "";
  let params: Record<string, unknown> | null = null;

  for (const key of ACTION_KEYS) {
    if (typeof raw[key] === "string") { action = raw[key]; break; }
  }

  for (const [key, val] of Object.entries(raw)) {
    if (key === "service" || ACTION_KEYS.has(key)) continue;
    if (val && typeof val === "object" && !Array.isArray(val)) { params = val as Record<string, unknown>; break; }
  }

  if (!params) {
    const loose: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (key === "service" || ACTION_KEYS.has(key)) continue;
      loose[key] = val;
    }
    if (Object.keys(loose).length > 0) params = loose;
  }

  return { action, params: params ?? {} };
}

function findTestEndpoint(def: ServiceDef): string | null {
  const preferred = ["get_profile", "get_user", "whoami", "get_me", "me", "list_projects", "list_channels"];
  for (const name of preferred) {
    if (def.endpoints.some((ep) => ep.name === name)) return name;
  }

  for (const ep of def.endpoints) {
    if (ep.transport.type === "rest") {
      const t = ep.transport as { method: string };
      if (t.method === "GET") return ep.name;
    }
  }

  return def.endpoints[0]?.name ?? null;
}
