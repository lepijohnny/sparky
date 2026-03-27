import type { StorageProvider } from "./storage";
import type { Workspace } from "../settings/workspace.types";
import type { LlmConnection, LlmDefault } from "../settings/llm.types";
import type { Label } from "../settings/labels.types";
import type { ServiceDef } from "./proxy/proxy.schema";
const CONFIG_PATH = "config.json";

/** Shape of the unified config.json file */
export interface ConverterSettings {
  maxOutputChars: number;
  urlMaxDepth: number;
  urlMaxPages: number;
  urlRespectRobots: boolean;
}

export const CONVERTER_DEFAULTS: ConverterSettings = {
  maxOutputChars: 100_000,
  urlMaxDepth: 3,
  urlMaxPages: 200,
  urlRespectRobots: true,
};

export interface ConfigFile {
  activeTheme?: string;
  activeWorkspace?: string;
  workspaces?: Workspace[];
  llms?: LlmConnection[];
  llmDefault?: LlmDefault | null;
  labels?: Label[];
  allowlist?: string[];
  services?: ServiceDef[];
  converter?: Partial<ConverterSettings>;
}

export interface Configuration {
  read(): ConfigFile;
  get<K extends keyof ConfigFile>(key: K): ConfigFile[K];
  update<K extends keyof ConfigFile>(key: K, fn: (current: ConfigFile[K]) => ConfigFile[K]): Promise<void>;
  set<K extends keyof ConfigFile>(key: K, value: ConfigFile[K]): Promise<void>;
}

/** @deprecated Use Configuration */
export type ConfigManager = Configuration;

export function createConfiguration(storage: StorageProvider): Configuration {
  let queue: Promise<void> = Promise.resolve();

  function readConfig(): ConfigFile {
    if (!storage.exists(CONFIG_PATH)) return {};
    try {
      return storage.read<ConfigFile>(CONFIG_PATH);
    } catch {
      return {};
    }
  }

  return {
    read: readConfig,

    get(key) {
      return readConfig()[key];
    },

    async update(key, fn) {
      queue = queue.then(() => {
        const config = readConfig();
        config[key] = fn(config[key]);
        storage.write(CONFIG_PATH, config);
      });
      await queue;
    },

    async set(key, value) {
      await this.update(key, () => value);
    },
  };
}
