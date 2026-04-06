import { v7 as randomUUIDv7 } from "uuid";
import { createChatWorkspace } from "./chat/chat";
import { createSvcCrud } from "./chat/chat.service";
import type { Agent } from "./core/agent.types";
import { createEventBus } from "./core/bus";
import { createConfiguration } from "./core/config";
import { Connection } from "./core/connection";
import { createRegistry } from "./core/registry";
import { createRegistryCrud } from "./core/registry.crud";
import { createPlatformKeychain } from "./core/keychain";
import { createCredStore } from "./core/cred";
import { createTrustStore } from "./core/trust";
import { registerTrustBus as createTrustCrud } from "./core/trust.bus";
import { registerSkillsBus as createSkillsCrud } from "./skills/skills.crud";
import { registerFsComplete as createFsComplete } from "./core/fs.complete";
import { createAuthManager } from "./core/auth/auth";
import { createOAuthGateway } from "./core/auth/oauth.gateway";
import { loopbackOAuthService } from "./core/auth/oauth.service";
import { buildAuthFlows } from "./sparky.flows";

import { createStorage } from "./core/storage";
import { createWorkspace } from "./core/workspace.seed";
import { createFileLogger } from "./logger";
import { createKtDatabase } from "./knowledge/kt.db";
import { createKtManager } from "./knowledge/kt";
import { createSearchService } from "./core/search/search";
import { shutdownWorker } from "./knowledge/worker/kt.worker.client";
import { createSettingsCrud } from "./settings";
import { createAdapters } from "./core/adapters/adapters";
import { configJsonBackwardCompatibilityHook as backwardCompatibilityHook } from "./core/compat";
import { createRoutineDb } from "./chat/chat.routine.db";
import { registerRoutineBus } from "./routines/routine.bus";
import { createRoutineExecutor } from "./routines/routine.executor";
import { createRoutineScheduler } from "./routines/routine.scheduler";

export interface Sparky {
  start(): Promise<{ port: number; token: string }>;
  dispose(): Promise<void>;
}

export function createSparky(): Sparky {
  const token = randomUUIDv7();
  const logger = createFileLogger("debug");
  const bus = createEventBus(logger.createLogger("bus"));
  const storage = createStorage(logger.createLogger("storage")).seed();
  const config = createConfiguration(storage);
  const keychain = createPlatformKeychain();
  const cred = createCredStore(logger.createLogger("cred"), storage.root(""), keychain);
  const trustStore = createTrustStore(logger.createLogger("trust"), storage.root(""), keychain);
  const adapters = createAdapters(cred, logger.createLogger("adapters"));
  const authLog = logger.createLogger("auth");
  const oauthGateway = createOAuthGateway(authLog);
  const auth = createAuthManager(authLog, cred, oauthGateway, buildAuthFlows(logger, cred, adapters.getById("copilot")));
  const registry = createRegistry(bus, config, adapters, auth, logger.createLogger("registry"));
  const workspace = createWorkspace(config, storage);
  let currentWorkspacePath = storage.root(workspace.dir);
  const ktDb = createKtDatabase(workspace.dbPath.replace(/\.db$/, ".kt.db"), logger.createLogger("knowledge.db"));
  const knowledgeManager = createKtManager(bus, ktDb, config, logger.createLogger("knowledge"), storage.root(""));
  const getEnvVars = () => cred.getEnvVars();

  const chatManager = createChatWorkspace(
    bus, 
    config, 
    logger.createLogger("chat"), 
    workspace.dbPath, 
    currentWorkspacePath,
    trustStore, 
    agentFn, 
    defaultAgentFn, 
    knowledgeManager,
    getEnvVars);

  const routineDb = createRoutineDb(chatManager.connection);
  const routineLog = logger.createLogger("routine");
  const executeRoutine = createRoutineExecutor(bus, routineDb, routineLog);
  registerRoutineBus(bus, routineDb, routineLog, executeRoutine);
  const routineScheduler = createRoutineScheduler(routineDb, executeRoutine, routineLog);

  let hub: Connection | null = null;

  createRegistryCrud(bus, config, registry);
  createSvcCrud(bus, config, logger.createLogger("service"), cred, storage);
  createSettingsCrud(bus, storage, config, cred, logger);
  createSearchService(bus, logger.createLogger("search"), searchAgentFn);
  createTrustCrud(bus, trustStore, broadcast);
  createSkillsCrud(bus, logger.createLogger("skills"), storage, (skillId?: string) => skillId ? cred.getEnvVarsForSkill(skillId) : cred.getEnvVars(), broadcast);

  async function agentFn(chatId: string): Promise<{ agent: Agent; contextWindow?: number; webSearch?: string } | null> {
    const chat = chatManager.getChat(chatId);
    if (!chat) throw new Error(`Chat not found: ${chatId}`);

    const conns = config.get("llms") ?? [];
    const defaultId = config.get("llmDefault")?.id;
    const defaultConn = conns.find((c) => c.id === defaultId);

    const conn =
      (chat.connectionId && conns.find((c) => c.id === chat.connectionId))
      || (defaultConn && (!chat.provider || defaultConn.provider === chat.provider) ? defaultConn : undefined)
      || (chat.provider && conns.find((c) => c.provider === chat.provider))
      || defaultConn;

    if (!conn) throw new Error("No connection configured");
    if (chat.provider && conn.provider !== chat.provider) {
      throw new Error(`Connection not found — the "${chat.provider}" provider is no longer configured. Add it in Settings → LLM or switch this chat's model.`);
    }

    const adapter = registry.get(conn.provider);
    if (!adapter) throw new Error(`Unknown provider: ${conn.provider}`);

    const modelId = chat.model || conn.model || defaultConn?.model || undefined;
    const thinking = chat.thinking ?? conn.thinking ?? defaultConn?.thinking ?? 0;
    const models = await adapter.models(conn);
    const modelDef = modelId ? models.find((m) => m.id === modelId) : models[0];

    const log = logger.createLogger("sparky");
    if (!modelDef) {
      log.warn("Model not found in adapter models list", { modelId, provider: conn.provider, available: models.map((m) => m.id) });
    } else if (!modelDef.contextWindow) {
      log.warn("Model has no contextWindow", { modelId, provider: conn.provider });
    }

    return {
      agent: adapter.createAgent({ ...conn, model: modelId, thinking }),
      contextWindow: modelDef?.maxOutputTokens
        ? (modelDef.contextWindow ?? 0) - modelDef.maxOutputTokens
        : modelDef?.contextWindow,
      webSearch: modelDef?.webSearch,
    };
  }

  async function defaultAgentFn(): Promise<{ agent: Agent; contextWindow?: number } | null> {
    const conns = config.get("llms") ?? [];
    const defaultId = config.get("llmDefault")?.id;
    const conn = conns.find((c) => c.id === defaultId);
    if (!conn) return null;

    const adapter = registry.get(conn.provider);
    if (!adapter) return null;

    return {
      agent: adapter.createAgent({ ...conn, thinking: 0 }),
    };
  }

  async function searchAgentFn(): Promise<{ agent: Agent; provider: string; model: string } | null> {
    const conns = config.get("llms") ?? [];
    const defaultId = config.get("llmDefault")?.id;

    const defaultConn = conns.find((c) => c.id === defaultId);
    if (defaultConn) {
      const adapter = registry.get(defaultConn.provider);
      if (adapter?.searchModel) {
        const valid = await adapter.validate(defaultConn);
        if (valid) {
          return {
            agent: adapter.createAgent({ ...defaultConn, model: adapter.searchModel, thinking: 0 }, { webSearch: true }),
            provider: adapter.name,
            model: adapter.searchModel,
          };
        }
      }
    }

    for (const conn of conns) {
      if (conn.id === defaultId) continue;
      const adapter = registry.get(conn.provider);
      if (!adapter?.searchModel) continue;

      const valid = await adapter.validate(conn);
      if (!valid) continue;

      return {
        agent: adapter.createAgent({ ...conn, model: adapter.searchModel, thinking: 0 }, { webSearch: true }),
        provider: adapter.name,
        model: adapter.searchModel,
      };
    }

    return null;
  }

  function broadcast(route: string, data: any) {
    hub?.broadcast(route, data);
  }

  async function prefetchModels(): Promise<void> {
    const log = logger.createLogger("sparky");
    const conns = config.get("llms") ?? [];
    const seen = new Set<string>();

    const tasks = conns
      .filter((c) => { if (seen.has(c.provider)) return false; seen.add(c.provider); return true; })
      .map(async (conn) => {
        const adapter = registry.get(conn.provider);
        if (!adapter) return;

        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            if ("resetCache" in adapter) (adapter as any).resetCache();
            const models = await adapter.models(conn);
            if (models.length > 0) {
              log.info("Prefetched models", { provider: conn.provider, count: models.length, attempt });
              return;
            }
          } catch (err) {
            if (attempt === 5) {
              log.warn("Prefetch failed", { provider: conn.provider, error: String(err) });
            }
          }
          if (attempt < 5) await new Promise((r) => setTimeout(r, 1000));
        }
      });

    await Promise.allSettled(tasks);
  }

  bus.on("auth.start", async (data) => {
    return auth.request(data.domain, data.provider, data.grant, data.params);
  });
  bus.on("auth.finish", async (data) => {
    return auth.verify(data.domain, data.provider, data.grant, data.params);
  });

  bus.on("cred.get", async (data) => {
    return { value: await cred.get(data.key) };
  });
  bus.on("cred.set", async (data) => {
    await cred.set(data.key, data.value);
    return {};
  });
  bus.on("cred.delete", async (data) => {
    await cred.delete(data.key);
    return {};
  });
  bus.on("cred.list", () => {
    return { keys: cred.keys() };
  });
  bus.on("cred.clear", async (data) => {
    await cred.deletePrefix(data.prefix);
    return {};
  });
  bus.on("core.config.get", (data) => {
    return config.get(data.key as any) ?? null;
  });
  bus.on("core.config.set", async (data) => {
    await config.set(data.key as any, data.value);
    return { ok: true };
  });
  bus.on("diagnostics.logs.read", () => {
    const lines = logger.readTodayLinesSync();
    return { lines };
  });

  loopbackOAuthService(bus, cred, oauthGateway, authLog);
  createFsComplete(bus);

  bus.subscribe("settings.appearance.theme.changed", (data) => broadcast("settings.appearance.theme.changed", data));
  bus.subscribe("settings.appearance.theme.created", (data) => broadcast("settings.appearance.theme.created", data));

  bus.subscribe("settings.workspace.changed", async (data: { workspace: { id: string; path: string } }) => {
    const newWsDir = data.workspace.path;
    if (newWsDir) storage.mkdir(newWsDir);
    const newDbPath = newWsDir
      ? storage.root(`${newWsDir}/workspace.db`)
      : storage.root("workspace.db");
    currentWorkspacePath = storage.root(newWsDir);

    await chatManager.stopAll();
    chatManager.switchDb(newDbPath, logger.createLogger("chat"));
    chatManager.setWorkspacePath(currentWorkspacePath);
    knowledgeManager.switchDb(newDbPath.replace(/\.db$/, ".kt.db"));
    broadcast("settings.workspace.changed", data);
  });

  bus.subscribe("chat.created", (data) => broadcast("chat.created", data));
  bus.subscribe("chat.updated", (data) => broadcast("chat.updated", data));
  bus.subscribe("chat.deleted", (data) => broadcast("chat.deleted", data));
  bus.subscribe("chat.event", (data: any) => broadcast("chat.event", data));
  bus.subscribe("tool.approval.request", (data: any) => broadcast("tool.approval.request", data));
  bus.subscribe("tool.approval.dismissed", (data: any) => broadcast("tool.approval.dismissed", data));

  bus.subscribe("settings.labels.created", (data) => broadcast("settings.labels.created", data));
  bus.subscribe("settings.labels.updated", (data) => broadcast("settings.labels.updated", data));
  bus.subscribe("settings.labels.deleted", (data) => broadcast("settings.labels.deleted", data));
  bus.subscribe("settings.labels.deleted", (data: { id: string }) => chatManager.removeLabel(data.id));

  bus.subscribe("kt.source.created", (data) => broadcast("kt.source.created", data));
  bus.subscribe("kt.source.updated", (data) => broadcast("kt.source.updated", data));
  bus.subscribe("kt.source.deleted", (data) => broadcast("kt.source.deleted", data));

  bus.subscribe("svc.register", (data) => broadcast("svc.register", data));

  bus.subscribe("routine.updated", (data) => broadcast("routine.updated", data));
  bus.subscribe("routine.deleted", (data) => broadcast("routine.deleted", data));

  bus.subscribe("svc.updated", (data) => broadcast("svc.updated", data));
  bus.subscribe("svc.delete", (data) => broadcast("svc.delete", data));
  bus.subscribe("svc.guide", (data) => broadcast("svc.guide", data));

  return {
    async start() {
      const log = logger.createLogger("sparky");
      await logger.init();
      log.info("Starting Sparky");
      await cred.init();
      await trustStore.init();
      await bus.emit("storage.ready");
      await knowledgeManager.init();

      backwardCompatibilityHook(log, [
        {
          name: "add workspaceId to labels",
          run: () => {
            const wsId = config.get("activeWorkspace");
            if (!wsId) return;
            const all = config.get("labels") ?? [];
            const missing = all.some((l) => !l.workspaceId);
            if (!missing) return;
            config.update("labels", (labels = []) =>
              labels.map((l) => l.workspaceId ? l : { ...l, workspaceId: wsId }),
            );
            log.info("Stamped labels missing workspaceId");
          },
        },
      ]);

      hub = new Connection(bus, token, logger.createLogger("connection"));
      const port = await hub.start();

      logger.setBroadcaster((route, data) => {
        hub?.broadcast(route, data, true);
      });

      bus.on("core.prefetch", async () => {
        await prefetchModels();
        hub?.broadcast("core.models.ready", {});
        return { ok: true };
      });

      routineScheduler.start();

      log.info(`Ready on port ${port}`);
      return { port, token };
    },

    async dispose() {
      const log = logger.createLogger("sparky");
      log.info("Shutting down Sparky");
      routineScheduler.stop();
      await shutdownWorker();
      chatManager.dispose();
      auth.dispose();
      await registry.dispose();
      hub?.stop();
      log.info("Sparky shut down");
    },
  };
}
