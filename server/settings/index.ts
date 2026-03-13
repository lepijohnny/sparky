import type { EventBus } from "../core/bus";
import type { StorageProvider } from "../core/storage";
import type { Configuration } from "../core/config";
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
}
