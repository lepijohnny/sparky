import type { EventBus } from "../core/bus";
import type { ConfigManager } from "../core/config";
import type { Credentials } from "../core/cred";
import type { Logger } from "../logger.types";
import type { LlmConnection, LlmDefault } from "./llm.types";

export class LlmSettings {
  private log;

  constructor(bus: EventBus,
    private config: ConfigManager,
    private cred: Credentials,
    logger: Logger,
  ) {
    this.log = logger;

    bus.on("settings.llm.connections.list", () => this.list());
    bus.on("settings.llm.connections.add", (data) => this.add(data));
    bus.on("settings.llm.connections.update", (data) => this.update(data));
    bus.on("settings.llm.connections.remove", (data) => this.remove(data));
    bus.on("settings.llm.default.get", () => this.getDefault());
    bus.on("settings.llm.default.set", (data) => this.setDefault(data));
  }

  private readConnections(): LlmConnection[] {
    const connections: LlmConnection[] = this.config.get("llms") ?? [];
    for (const c of connections) {
      if (typeof c.thinking === "boolean") {
        (c as any).thinking = c.thinking ? 2 : 0;
      }
    }
    return connections;
  }

  private list(): { connections: LlmConnection[] } {
    const connections = this.readConnections();
    this.log.debug("Listing connections", { count: connections.length });
    return { connections };
  }

  private async add(data: Omit<LlmConnection, "id" | "createdAt" | "credPrefix"> & { host?: string }): Promise<{ connection: LlmConnection }> {
    const connection: LlmConnection = {
      id: crypto.randomUUID(),
      provider: data.provider,
      name: data.name,
      grant: data.grant,
      credPrefix: data.grant === "local" ? "" : `llm.${data.provider}.${data.grant}`,
      ...(data.host ? { host: data.host } : {}),
      createdAt: new Date().toISOString(),
    };

    await this.config.update("llms", (llms) => [...(llms ?? []), connection]);

    const current = this.config.get("llmDefault");
    if (!current) {
      await this.config.set("llmDefault", { id: connection.id, name: connection.name });
      this.log.info("Auto-set default connection", { id: connection.id });
    }

    this.log.info("Added connection", { id: connection.id, provider: connection.provider });
    return { connection };
  }

  private async update(data: { id: string; model?: string; thinking?: number; knowledge?: boolean; assistant?: boolean }): Promise<{ connection: LlmConnection }> {
    let updated: LlmConnection | null = null;

    await this.config.update("llms", (llms = []) =>
      llms.map((c) => {
        if (c.id !== data.id) return c;
        const next: LlmConnection = {
          ...c,
          ...(data.model !== undefined ? { model: data.model } : {}),
          ...(data.thinking !== undefined ? { thinking: data.thinking } : {}),
          ...(data.knowledge !== undefined ? { knowledge: data.knowledge } : {}),
          ...(data.assistant !== undefined ? { assistant: data.assistant } : {}),
        };
        updated = next;
        return next;
      }),
    );

    if (!updated) throw new Error(`Connection not found: ${data.id}`);
    this.log.info("Updated connection", { id: data.id, model: (updated as LlmConnection).model, thinking: (updated as LlmConnection).thinking, knowledge: (updated as LlmConnection).knowledge, assistant: (updated as LlmConnection).assistant });
    return { connection: updated as LlmConnection };
  }

  private async remove(data: { id: string }): Promise<{ removed: boolean }> {
    const connections = this.readConnections();
    const idx = connections.findIndex((c) => c.id === data.id);
    if (idx === -1) {
      this.log.warn("Connection not found for removal", { id: data.id });
      return { removed: false };
    }

    const [removed] = connections.splice(idx, 1);
    await this.config.set("llms", connections);

    if (removed.credPrefix) {
      await this.cred.deletePrefix(removed.credPrefix);
      this.log.info("Cleaned up credentials", { credPrefix: removed.credPrefix });
    }

    const current = this.config.get("llmDefault");
    if (current?.id === data.id) {
      const next = connections[0];
      const newDefault = next ? { id: next.id, name: next.name } : null;
      await this.config.set("llmDefault", newDefault);
      this.log.info("Default connection updated after removal", { newDefault: newDefault?.id ?? "none" });
    }

    this.log.info("Removed connection", { id: removed.id, provider: removed.provider });
    return { removed: true };
  }

  private getDefault(): { default: LlmDefault | null } {
    return { default: this.config.get("llmDefault") ?? null };
  }

  private async setDefault(data: LlmDefault): Promise<{ default: LlmDefault }> {
    await this.config.set("llmDefault", data);
    this.log.info("Set default connection", { id: data.id, name: data.name });
    return { default: data };
  }
}
