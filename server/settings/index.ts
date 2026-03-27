import type { EventBus } from "../core/bus";
import type { StorageProvider } from "../core/storage";
import { type Configuration, type ConverterSettings, CONVERTER_DEFAULTS } from "../core/config";
import type { Credentials } from "../core/cred";
import type { FileLogger } from "../logger";
import { AppearanceSettings } from "./appearance";
import { EnvironmentSettings } from "./environment";
import { LabelsSettings } from "./labels";
import { LlmSettings } from "./llm";
import { ProfileSettings } from "./profile";
import { WorkspaceSettings } from "./workspace";

export function createSettingsCrud(bus: EventBus, storage: StorageProvider, config: Configuration, cred: Credentials, logger: FileLogger): void {
  new AppearanceSettings(bus, storage, config, logger.createLogger("settings.appearance"));
  new EnvironmentSettings(bus, cred, logger.createLogger("settings.environment"));
  new LabelsSettings(bus, config, logger.createLogger("settings.labels"));
  new LlmSettings(bus, config, cred, logger.createLogger("settings.llm"));
  new ProfileSettings(bus, config, logger.createLogger("settings.profile"));
  new WorkspaceSettings(bus, storage, config, logger.createLogger("settings.workspace"));

  bus.on("settings.converter.get", () => {
    const partial = config.get("converter") ?? {};
    return { settings: { ...CONVERTER_DEFAULTS, ...partial } };
  });

  bus.on("settings.converter.set", async (data) => {
    const current = config.get("converter") ?? {};
    const merged = { ...CONVERTER_DEFAULTS, ...current, ...data };
    await config.set("converter", merged);
    return { settings: merged as ConverterSettings };
  });
}
