import { v7 as randomUUIDv7 } from "uuid";
import { basename, extname } from "node:path";
import { stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { EventBus } from "../core/bus";
import type { Configuration } from "../core/config";
import type { StorageProvider } from "../core/storage";
import type { Logger } from "../logger.types";
import type { Source, SourceFile, SearchResult } from "./kt.types";
import type { KtDatabase } from "./kt.db";
import { ExtractorRegistry } from "./kt.extractor";
import { loadExtractors, listExtractors } from "./kt.extractor.loader";
import { IndexPipeline } from "./kt.indexing";
import { search } from "./kt.search";
import { getExtractorOptions, setExtractorOptions } from "./kt.extractor.options";

export interface KtManager {
  init(): Promise<void>;
  search(query: string): Promise<SearchResult[]>;
  switchDb(dbPath: string): void;
}

/** @deprecated Use KtManager instead */
export type KnowledgeManager = KtManager;

export function createKtManager(
  bus: EventBus,
  db: KtDatabase,
  config: Configuration,
  log: Logger,
  storageRoot: string,
  storage: StorageProvider,
): KtManager {
  const registry = new ExtractorRegistry();
  let pipeline: IndexPipeline;

  function getMode(): Source["mode"] {
    const ws = config.get("workspaces") as any[];
    const active = config.get("activeWorkspace") as string;
    const workspace = ws?.find((w: any) => w.id === active);
    return workspace?.knowledgeSearch === "hybrid" ? "hybrid" : "keyword";
  }

  function getSource(id: string) {
    const source = db.getSource(id);
    if (!source) return null;
    const files = db.getSourceFiles(id);
    return { source, files };
  }

  function deleteSource(id: string) {
    const deleted = db.transaction(() => {
      db.deleteChunksBySource(id);
      db.deleteVectorsBySource(id);
      db.deleteSourceFiles(id);
      return db.deleteSource(id);
    });
    if (deleted) {
      try { db.vacuum(); } catch {}
      bus.emit("kt.source.deleted", { id });
      log.info("Source deleted", { id });
    }
    return { deleted };
  }

  function cancel(data: { id: string }) {
    pipeline.cancel(data.id);
    log.info("Source indexing cancelled", { id: data.id });
    return { ok: true };
  }

  async function addFile(path: string): Promise<{ source: Source }> {
    const ext = extname(path).toLowerCase();
    if (!registry.get(ext)) throw new Error(`Unsupported file type: ${ext}`);
    if (db.sourceExistsByLocation(path)) throw new Error("This file has already been added");

    const info = await stat(path);
    const mode = getMode();
    const now = new Date().toISOString();
    const source: Source = {
      id: randomUUIDv7(), name: basename(path), type: "file", location: path,
      fileCount: 1, chunkCount: 0, mode, status: "pending", createdAt: now, updatedAt: now,
    };
    const file: SourceFile = {
      id: randomUUIDv7(), sourceId: source.id, name: basename(path), path, ext,
      size: info.size, chunkCount: 0, status: "pending",
    };

    db.createSource(source);
    db.createSourceFile(file);
    bus.emit("kt.source.created", { source });
    log.info("File source added", { id: source.id, path, mode });
    pipeline.enqueue(source.id);
    return { source };
  }

  async function addFolder(path: string): Promise<{ source: Source }> {
    if (db.sourceExistsByLocation(path)) throw new Error("This folder has already been added");
    const supported = new Set(registry.supportedExtensions());
    const files = await scanFolder(path, supported);
    if (files.length === 0) throw new Error("No supported files found in folder");

    const mode = getMode();
    const now = new Date().toISOString();
    const source: Source = {
      id: randomUUIDv7(), name: basename(path), type: "folder", location: path,
      fileCount: files.length, chunkCount: 0, mode, status: "pending", createdAt: now, updatedAt: now,
    };

    db.createSource(source);
    for (const filePath of files) {
      let size = 0;
      try { size = (await stat(filePath)).size; } catch {}
      const sf: SourceFile = {
        id: randomUUIDv7(), sourceId: source.id, name: basename(filePath), path: filePath,
        ext: extname(filePath).toLowerCase(), size, chunkCount: 0, status: "pending",
      };
      db.createSourceFile(sf);
    }

    bus.emit("kt.source.created", { source });
    log.info("Folder source added", { id: source.id, path, fileCount: files.length, mode });
    pipeline.enqueue(source.id);
    return { source };
  }

  async function addUrl(url: string): Promise<{ source: Source }> {
    if (db.sourceExistsByLocation(url)) throw new Error("This URL has already been added");
    let name = url;
    try { const u = new URL(url); name = u.hostname + u.pathname; } catch {}

    const mode = getMode();
    const now = new Date().toISOString();
    const source: Source = {
      id: randomUUIDv7(), name, type: "url", location: url,
      fileCount: 1, chunkCount: 0, mode, status: "pending", createdAt: now, updatedAt: now,
    };
    const file: SourceFile = {
      id: randomUUIDv7(), sourceId: source.id, name, path: url, ext: "url",
      size: 0, chunkCount: 0, status: "pending",
    };

    db.createSource(source);
    db.createSourceFile(file);
    bus.emit("kt.source.created", { source });
    log.info("URL source added", { id: source.id, url, mode });
    pipeline.enqueue(source.id);
    return { source };
  }

  async function reindex(data: { id: string; force?: boolean }): Promise<{ source: Source }> {
    const source = db.getSource(data.id);
    if (!source) throw new Error(`Source not found: ${data.id}`);

    const mode = getMode();
    if (source.mode !== mode) {
      db.updateSourceMode(source.id, mode);
      source.mode = mode;
    }

    log.info("Source reindex requested", { id: source.id, mode, force: !!data.force });
    pipeline.enqueueReindex(source.id, !!data.force);
    return { source };
  }

  async function scanFolder(dir: string, supported: Set<string>): Promise<string[]> {
    const results: string[] = [];
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...await scanFolder(full, supported));
        } else {
          const ext = extname(entry.name).toLowerCase();
          if (supported.has(ext)) results.push(full);
        }
      }
    } catch (err) {
      log.warn("Failed to scan folder", { dir, error: String(err) });
    }
    return results;
  }

  // ── Bus handlers ───────────────────────────────────────────────────

  bus.on("kt.sources.list", () => ({ sources: db.listSources() }));
  bus.on("kt.sources.count", () => ({ count: db.countSources() }));
  bus.on("kt.sources.get", (data) => getSource(data.id));
  bus.on("kt.sources.delete", (data) => deleteSource(data.id));
  bus.on("kt.sources.add.file", (data) => addFile(data.path));
  bus.on("kt.sources.add.folder", (data) => addFolder(data.path));
  bus.on("kt.sources.add.url", (data) => addUrl(data.url));
  bus.on("kt.sources.reindex", (data) => reindex(data));
  bus.on("kt.sources.cancel", (data) => cancel(data));
  bus.on("kt.sources.extensions", () => ({ extensions: registry.supportedExtensions() }));
  bus.on("extractors.list", async () => ({ extractors: await listExtractors(storageRoot) }));
  bus.on("extractors.options.get", (data) => ({ options: getExtractorOptions(storage, data.name) }));
  bus.on("extractors.options.set", (data) => {
    setExtractorOptions(storage, data.name, data.options);
    return { ok: true };
  });
  bus.on("kt.search", async (data: { query: string; limit?: number; minScore?: number }) => {
    const cacheDir = join(storageRoot, "models");
    const results = await search(db, data.query, cacheDir, log, {
      limit: data.limit, minScore: data.minScore, mode: getMode(),
    });
    return { results };
  });

  return {
    async init() {
      await loadExtractors(registry, storageRoot, log);
      pipeline = new IndexPipeline(db, registry, bus, log, storageRoot, storage);
      log.info("Extractors loaded", { extensions: registry.supportedExtensions() });
    },

    async search(query) {
      const sourceCount = db.countSources();
      if (sourceCount === 0) {
        log.debug("Knowledge search skipped, no sources");
        return [];
      }
      const cacheDir = join(storageRoot, "models");
      const mode = getMode();
      log.debug("Knowledge search", { query, mode, sources: sourceCount });
      const results = await search(db, query, cacheDir, log, { mode });
      log.debug("Knowledge search done", { results: results.length });
      return results;
    },

    switchDb(dbPath) {
      db.reopen(dbPath);
    },
  };
}
