import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Logger } from "../logger.types";
import type { ExtractionResult } from "./kt.types";
import { ExtractorRegistry } from "./kt.extractor";
import type { InstalledExtractor, ExtractorOption } from "./kt.extractor.types";

const BUILTIN_DIR = join(dirname(fileURLToPath(import.meta.url)), "extractors");

interface PluginModule {
  extensions: string[];
  extract: (target: string, log: (msg: string) => void) => AsyncGenerator<ExtractionResult>;
}

function isValidPlugin(mod: unknown): mod is PluginModule {
  if (!mod || typeof mod !== "object") return false;
  const m = mod as Record<string, unknown>;
  return (
    Array.isArray(m.extensions) &&
    m.extensions.every((e: unknown) => typeof e === "string") &&
    typeof m.extract === "function"
  );
}

/**
 * Wraps a plugin's extract() generator with timeout and error handling.
 * The timeout applies to the total iteration time, not per-yield.
 */
function safeExtract(
  pluginName: string,
  extractFn: (target: string, log: (msg: string) => void, options?: Record<string, unknown>) => AsyncGenerator<ExtractionResult>,
  timeoutMs: number,
  log: Logger,
): (target: string, log: (msg: string) => void, options?: Record<string, unknown>) => AsyncGenerator<ExtractionResult> {
  return async function*(target: string, logFn: (msg: string) => void, options?: Record<string, unknown>) {
    const pluginLog = logFn ?? ((msg: string) => log.info(`[${pluginName}] ${msg}`));
    const deadline = Date.now() + timeoutMs;
    try {
      for await (const segment of extractFn(target, pluginLog, options)) {
        if (Date.now() > deadline) {
          throw new Error(`Extractor "${pluginName}" timed out after ${timeoutMs}ms`);
        }
        yield segment;
      }
    } catch (err) {
      log.error(`Extractor "${pluginName}" failed`, { error: String(err) });
      throw err;
    }
  };
}

async function loadFromDir(
  dir: string,
  registry: ExtractorRegistry,
  log: Logger,
  label: string,
): Promise<void> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }

  for (const name of names) {
    const fullPath = join(dir, name);
    const tsPath = join(fullPath, "index.ts");
    const jsPath = join(fullPath, "index.js");
    const indexPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null;
    try {
      const s = await stat(fullPath);
      if (!s.isDirectory()) continue;
      if (!indexPath) continue;
    } catch {
      continue;
    }

    try {
      const mod = await import(pathToFileURL(indexPath).href);
      if (!isValidPlugin(mod)) {
        log.warn(`Skipping invalid extractor plugin: ${name}`, { dir: label });
        continue;
      }

      const wrapped = safeExtract(name, mod.extract, 30_000, log);
      registry.register({ name, extensions: mod.extensions, extract: wrapped });
      log.info(`Loaded extractor: ${name}`, { extensions: mod.extensions, source: label });
    } catch (err) {
      log.warn(`Failed to load extractor plugin: ${name}`, { error: String(err), dir: label });
    }
  }
}

/**
 * Scan ~/.sparky/plugins/ext/node_modules/ for npm packages that declare
 * sparky.extractors in their package.json. Each entry points to a directory
 * containing index.js or index.ts with the standard plugin shape.
 */
async function loadFromPlugins(
  storageRoot: string,
  registry: ExtractorRegistry,
  log: Logger,
): Promise<void> {
  const modulesDir = join(storageRoot, "plugins", "ext", "node_modules");
  let names: string[];
  try {
    names = await readdir(modulesDir);
  } catch {
    return;
  }

  for (const name of names) {
    if (name.startsWith(".")) continue;
    const pkgDir = join(modulesDir, name);
    const pkgJsonPath = join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) continue;

    try {
      const pkgJson = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
      const extractorPaths: string[] = pkgJson.sparky?.extractors;
      if (!Array.isArray(extractorPaths) || extractorPaths.length === 0) continue;

      for (const rel of extractorPaths) {
        const extDir = join(pkgDir, rel);
        const tsPath = join(extDir, "index.ts");
        const jsPath = join(extDir, "index.js");
        const indexPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null;
        if (!indexPath) continue;

        const mod = await import(pathToFileURL(indexPath).href);
        if (!isValidPlugin(mod)) {
          log.warn(`Skipping invalid plugin extractor: ${name}/${rel}`, { dir: "npm" });
          continue;
        }

        const timeoutMs = pkgJson.sparky?.timeout ?? 300_000;
        const pluginName = pkgJson.name ?? name;
        const wrapped = safeExtract(pluginName, mod.extract, timeoutMs, log);
        registry.register({ name: pluginName, extensions: mod.extensions, extract: wrapped });
        log.info(`Loaded extractor: ${pluginName}`, { extensions: mod.extensions, source: "npm", timeoutMs });
      }
    } catch (err) {
      log.warn(`Failed to load plugin: ${name}`, { error: String(err), dir: "npm" });
    }
  }
}

/**
 * Load all extractors: built-in first, then npm plugins.
 * Later entries override earlier for the same extension.
 */
export async function loadExtractors(
  registry: ExtractorRegistry,
  storageRoot: string,
  log: Logger,
): Promise<void> {
  await loadFromDir(BUILTIN_DIR, registry, log, "built-in");
  await loadFromPlugins(storageRoot, registry, log);
}

const VALID_OPTION_TYPES = new Set(["string", "number", "boolean", "select"]);

function parseOptions(raw: unknown): ExtractorOption[] {
  if (!Array.isArray(raw)) return [];
  const options: ExtractorOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.key !== "string" || typeof o.label !== "string") continue;
    if (!VALID_OPTION_TYPES.has(o.type as string)) continue;
    if (o.default === undefined) continue;
    options.push(item as ExtractorOption);
  }
  return options;
}

/**
 * List all installed plugins with metadata and options.
 * Built-in extractors are included with builtIn: true.
 */
export async function listExtractors(storageRoot: string): Promise<InstalledExtractor[]> {
  const extractors: InstalledExtractor[] = [];

  let builtInNames: string[] = [];
  try {
    builtInNames = await readdir(BUILTIN_DIR);
  } catch {}

  for (const name of builtInNames) {
    const fullPath = join(BUILTIN_DIR, name);
    try {
      const s = await stat(fullPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    const pkgPath = join(fullPath, "package.json");
    let extensions: string[] = [];
    let options: ExtractorOption[] = [];
    let description: string | undefined;

    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
      description = pkg.description;
      options = parseOptions(pkg.sparky?.options);
    }

    const tsPath = join(fullPath, "index.ts");
    const jsPath = join(fullPath, "index.js");
    const indexPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null;
    if (indexPath) {
      try {
        const mod = await import(pathToFileURL(indexPath).href);
        if (isValidPlugin(mod)) extensions = mod.extensions;
      } catch {}
    }

    extractors.push({
      name,
      version: "built-in",
      description,
      extensions,
      options,
      builtIn: true,
    });
  }

  const modulesDir = join(storageRoot, "plugins", "ext", "node_modules");
  let npmNames: string[] = [];
  try {
    npmNames = await readdir(modulesDir);
  } catch {}

  for (const name of npmNames) {
    if (name.startsWith(".")) continue;
    const pkgDir = join(modulesDir, name);
    const pkgJsonPath = join(pkgDir, "package.json");
    if (!existsSync(pkgJsonPath)) continue;

    try {
      const pkg = JSON.parse(await readFile(pkgJsonPath, "utf-8"));
      const extractorPaths: string[] = pkg.sparky?.extractors;
      if (!Array.isArray(extractorPaths) || extractorPaths.length === 0) continue;

      let extensions: string[] = [];
      for (const rel of extractorPaths) {
        const extDir = join(pkgDir, rel);
        const tsPath = join(extDir, "index.ts");
        const jsPath = join(extDir, "index.js");
        const indexPath = existsSync(tsPath) ? tsPath : existsSync(jsPath) ? jsPath : null;
        if (!indexPath) continue;
        try {
          const mod = await import(pathToFileURL(indexPath).href);
          if (isValidPlugin(mod)) extensions = [...extensions, ...mod.extensions];
        } catch {}
      }

      extractors.push({
        name: pkg.name ?? name,
        version: pkg.version ?? "unknown",
        description: pkg.description,
        extensions,
        options: parseOptions(pkg.sparky?.options),
        builtIn: false,
      });
    } catch {}
  }

  return extractors;
}
