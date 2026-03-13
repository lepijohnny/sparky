/**
 * Extractor options persistence — reads/writes extractors.json via FileStorage.
 * Stores user-configured option values per extractor name.
 */
import type { StorageProvider } from "../core/storage";
import type { ExtractorOptionValues } from "./kt.extractor.types";

const FILE = "extractors.json";

function readAll(storage: StorageProvider): Record<string, ExtractorOptionValues> {
  if (!storage.exists(FILE)) return {};
  return storage.read(FILE);
}

export function getExtractorOptions(storage: StorageProvider, name: string): ExtractorOptionValues {
  const all = readAll(storage);
  return all[name] ?? {};
}

export function setExtractorOptions(storage: StorageProvider, name: string, values: ExtractorOptionValues): void {
  const all = readAll(storage);
  all[name] = values;
  storage.write(FILE, all);
}

export function getAllExtractorOptions(storage: StorageProvider): Record<string, ExtractorOptionValues> {
  return readAll(storage);
}
