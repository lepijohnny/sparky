import type { EventBus } from "../core/bus";
import type { ConfigManager } from "../core/config";
import type { Logger } from "../logger.types";
import type { Profile } from "./profile.types";

export class ProfileSettings {
  constructor(
    private bus: EventBus,
    private config: ConfigManager,
    private log: Logger,
  ) {
    bus.on("settings.profile.get", () => this.get());
    bus.on("settings.profile.set", (data) => this.set(data));
  }

  get(): { profile: Profile } {
    const profile = this.config.get("profile") as Profile | undefined;
    return { profile: profile ?? {} };
  }

  getProfile(): Profile {
    return (this.config.get("profile") as Profile | undefined) ?? {};
  }

  private async set(data: Partial<Profile>): Promise<{ profile: Profile }> {
    const current = this.getProfile();
    const updated: Profile = { ...current, ...data };
    await this.config.set("profile", updated);
    this.log.info("Updated profile", { nickname: updated.nickname, timezone: updated.timezone, language: updated.language });
    this.bus.emit("settings.profile.changed", { profile: updated });
    return { profile: updated };
  }
}
