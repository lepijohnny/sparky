import type { EventBus } from "../core/bus";
import type { Credentials } from "../core/cred";
import type { Logger } from "../logger.types";

export class EnvironmentSettings {
  private log;

  constructor(bus: EventBus, private secrets: Credentials, logger: Logger) {
    this.log = logger;

    bus.on("settings.environment.list", () => this.list());
  }

  private list() {
    const keys = this.secrets.keys();
    const entries = keys.map((key) => ({
      key,
      hasValue: true,
    }));
    this.log.debug("Listing environment entries", { count: entries.length });
    return { entries };
  }
}
