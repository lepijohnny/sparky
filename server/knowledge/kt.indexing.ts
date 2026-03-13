/**
 * Indexing pipeline: extract → chunk → embed (if hybrid) → store.
 * Cancellation is cooperative: cancel() sets status to "cancelled",
 * pipeline checks between files and stops gracefully.
 */
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Logger } from "../logger.types";
import type { EventBus } from "../core/bus";
import type { KtDatabase } from "./kt.db";
import type { ExtractorRegistry } from "./kt.extractor";
import type { Source, SourceFile } from "./kt.types";
import { chunkText } from "./kt.chunker";
import { getExtractorOptions } from "./kt.extractor.options";
import type { StorageProvider } from "../core/storage";
import { queue, Embed, terminateWorker } from "./worker/kt.worker.client";

interface QueueItem {
  sourceId: string;
  fn: () => Promise<void>;
}

export class IndexPipeline {
  private embedCacheDir: string;
  private queue: QueueItem[] = [];
  private running = false;
  private cancelledIds = new Set<string>();

  constructor(
    private db: KtDatabase,
    private registry: ExtractorRegistry,
    private bus: EventBus,
    private log: Logger,
    storageRoot: string,
    private storage: StorageProvider,
  ) {
    this.embedCacheDir = join(storageRoot, "models");
  }

  enqueue(sourceId: string): void {
    this.cancelledIds.delete(sourceId);
    this.setStatus(sourceId, "indexing");
    this.queue.push({ sourceId, fn: () => this.index(sourceId) });
    this.drain();
  }

  enqueueReindex(sourceId: string, force = false): void {
    this.cancelledIds.delete(sourceId);
    if (force) {
      this.db.transaction(() => {
        this.db.deleteChunksBySource(sourceId);
        this.db.deleteVectorsBySource(sourceId);
        const files = this.db.getSourceFiles(sourceId);
        for (const f of files) {
          this.db.updateSourceFileChunkCount(f.id, 0);
          this.db.updateSourceFileStatus(f.id, "pending");
        }
      });
      this.db.updateSourceCounts(sourceId);
    }
    this.setStatus(sourceId, "indexing");
    this.queue.push({ sourceId, fn: () => this.index(sourceId) });
    this.drain();
  }

  cancel(sourceId: string): void {
    this.cancelledIds.add(sourceId);

    // Remove from queue if not yet started
    const before = this.queue.length;
    this.queue = this.queue.filter((item) => item.sourceId !== sourceId);
    if (this.queue.length < before) {
      this.log.info("Pipeline: dequeued cancelled source", { sourceId });
    }

    this.db.updateSourceCounts(sourceId);
    this.setStatus(sourceId, "cancelled");
    this.log.info("Pipeline: marked source cancelled", { sourceId });
  }

  private isCancelled(sourceId: string): boolean {
    return this.cancelledIds.has(sourceId);
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift()!;
        try {
          await item.fn();
        } catch (err) {
          this.log.error("Pipeline: queue task failed", { error: String(err) });
        }
      }
    } finally {
      this.running = false;
      terminateWorker();
      this.log.info("Pipeline: queue drained");
    }
  }

  private async index(sourceId: string): Promise<void> {
    const source = this.db.getSource(sourceId);
    if (!source) {
      this.log.warn("Pipeline: source not found", { sourceId });
      return;
    }

    try {
      const files = this.db.getSourceFiles(sourceId);
      const embed = source.mode === "hybrid";
      const pending = files.filter((f) => f.status !== "ready");

      if (pending.length === 0) {
        this.log.info("Pipeline: all files already indexed", { sourceId });
        this.setStatus(sourceId, "ready");
        return;
      }

      this.log.info("Pipeline: indexing", { sourceId, total: files.length, pending: pending.length, skipped: files.length - pending.length });
      this.broadcastSource(sourceId);

      for (const file of pending) {
        if (this.isCancelled(sourceId)) {
          this.log.info("Pipeline: source cancelled, stopping", { sourceId });
          return;
        }

        await this.indexFile(file, embed);
        this.db.updateSourceCounts(sourceId);
        this.broadcastSource(sourceId);
        // Yield to event loop so broadcasts flush to clients
        await new Promise((r) => setTimeout(r, 0));
      }

      if (this.isCancelled(sourceId)) {
        this.log.info("Pipeline: source cancelled after last file", { sourceId });
        return;
      }

      this.setStatus(sourceId, "ready");
      this.cancelledIds.delete(sourceId);
      this.log.info("Pipeline: source indexed", { sourceId, mode: source.mode, files: files.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error("Pipeline: source failed", { sourceId, error: msg });
      if (!this.isCancelled(sourceId)) {
        this.setStatus(sourceId, "error", msg);
      }
    }
  }


  private async indexFile(file: SourceFile, embed: boolean): Promise<void> {
    const extractor = this.registry.get(file.ext);
    if (!extractor) {
      this.db.updateSourceFileStatus(file.id, "error", `No extractor for ${file.ext}`);
      this.log.warn("Pipeline: no extractor", { fileId: file.id, ext: file.ext });
      return;
    }

    try {
      this.db.updateSourceFileStatus(file.id, "indexing");
      this.broadcastSource(file.sourceId);

      const logFn = (msg: string) => this.log.info(`[extractor] ${msg}`, { fileId: file.id });
      const options = extractor.name ? getExtractorOptions(this.storage, extractor.name) : {};
      if (extractor.name && Object.keys(options).length > 0) {
        this.log.info("Pipeline: extractor options", { extractor: extractor.name, options });
      }
      let totalChunks = 0;

      for await (const segment of extractor.extract(file.path, logFn, options)) {
        if (this.isCancelled(file.sourceId)) {
          this.db.updateSourceFileStatus(file.id, "pending");
          return;
        }

        const chunks = chunkText(segment.text, segment.sections);
        if (chunks.length === 0) continue;

        const chunkRows = chunks.map((c) => {
          const header = c.section
            ? `Source: ${file.name}\nSection: ${c.section}\n\n`
            : `Source: ${file.name}\n\n`;
          return {
            id: randomUUID(),
            content: header + c.content,
            startOffset: c.startOffset,
            endOffset: c.endOffset,
            tokenEstimate: c.tokenEstimate,
            section: c.section,
          };
        });

        this.db.transaction(() => {
          this.db.insertChunks(file.id, chunkRows);
        });

        if (embed) {
          if (this.isCancelled(file.sourceId)) return;
          try {
            const texts = chunkRows.map((c) => c.content);
            const vectors = await queue(Embed(texts), this.embedCacheDir, this.log);
            if (this.isCancelled(file.sourceId)) return;
            this.db.insertVectors(
              chunkRows.map((c, i) => ({ id: c.id, sourceId: file.sourceId, vector: vectors[i] })),
            );
          } catch (err) {
            this.log.warn("Pipeline: embedding failed for segment", { fileId: file.id, error: String(err) });
          }
        }

        totalChunks += chunkRows.length;
        this.db.updateSourceFileChunkCount(file.id, totalChunks);
        this.db.updateSourceCounts(file.sourceId);
        this.broadcastSource(file.sourceId);
      }

      this.db.updateSourceFileStatus(file.id, "ready");
      this.log.info("Pipeline: file indexed", { fileId: file.id, chunks: totalChunks, embed });
    } catch (err) {
      if (this.isCancelled(file.sourceId)) return;
      const msg = err instanceof Error ? err.message : String(err);
      this.db.updateSourceFileStatus(file.id, "error", msg);
      this.log.error("Pipeline: file failed", { fileId: file.id, error: msg });
    }
  }

  private broadcastSource(sourceId: string): void {
    const source = this.db.getSource(sourceId);
    if (!source) return;
    const files = this.db.getSourceFiles(sourceId);
    this.bus.emit("kt.source.updated", { source, files });
  }

  private setStatus(sourceId: string, status: Source["status"], error?: string): void {
    this.db.updateSourceStatus(sourceId, status, error);
    this.broadcastSource(sourceId);
  }
}
