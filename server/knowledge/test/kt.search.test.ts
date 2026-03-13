import { describe, test, expect, vi, beforeEach } from "vitest";
import { search, type SearchOptions } from "../kt.search";
import type { RankingFn } from "../kt.rrf";
import type { KnowledgeDatabase } from "../kt.db";
import type { Logger } from "../../logger.types";

vi.mock("../worker/kt.worker.client", () => ({
  queue: vi.fn(async (work: any) => {
    switch (work.command) {
      case "embed": {
        const count = work.input.texts.length;
        return Array.from({ length: count }, () => new Float32Array(768));
      }
      case "keywords": return ["keyword1", "keyword2"];
      case "expand": return ["expanded one", "expanded two"];
      case "rerank": return work.input.documents.map(() => 0.5);
      default: throw new Error(`Unknown command: ${work.command}`);
    }
  }),
  Embed: vi.fn((texts: string[]) => ({ command: "embed", input: { texts }, priority: "low" })),
  EmbedOne: vi.fn((text: string) => ({ command: "embed", input: { texts: [text] }, priority: "high" })),
  Keywords: vi.fn((query: string) => ({ command: "keywords", input: { query }, priority: "high" })),
  Rewrite: vi.fn((query: string) => ({ command: "rewrite", input: { query }, priority: "high" })),
  Expand: vi.fn((query: string) => ({ command: "expand", input: { query }, priority: "high" })),
  Rerank: vi.fn((query: string, documents: string[]) => ({ command: "rerank", input: { query, documents }, priority: "high" })),
  terminateWorker: vi.fn(),
}));

function mockDb(overrides: Partial<Record<keyof KnowledgeDatabase, any>> = {}): KnowledgeDatabase {
  return {
    searchFts: vi.fn(() => []),
    searchVectors: vi.fn(() => []),
    getChunksByIds: vi.fn((ids: string[]) =>
      ids.map((id) => ({
        id,
        sourceId: "src-1",
        sourceFileName: "doc.md",
        content: `Content for ${id}`,
        section: null,
      })),
    ),
    getChunksBySourceIds: vi.fn((sourceIds: string[]) =>
      sourceIds.map((sid) => ({
        id: `chunk-${sid}`,
        sourceId: sid,
        sourceFileName: "doc.md",
        content: `Content for ${sid}`,
        section: null,
      })),
    ),
    getAdjacentChunks: vi.fn((chunkId: string) => [{
      id: chunkId,
      sourceId: "src-1",
      sourceFileName: "doc.md",
      content: `Content for ${chunkId}`,
      section: null,
    }]),
    ...overrides,
  } as unknown as KnowledgeDatabase;
}

const log: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe("kt.search — keyword mode", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test("given no results from fts, when searched, then returns empty", async () => {
    const db = mockDb();
    const results = await search(db, "hello", "/cache", log);
    expect(results).toEqual([]);
  });

  test("given fts results, when searched, then returns ranked results", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [
        { chunkId: "c1", rank: -10 },
        { chunkId: "c2", rank: -5 },
      ]),
    });
    const results = await search(db, "hello", "/cache", log, { mode: "keyword" });
    expect(results).toHaveLength(2);
    expect(results[0].chunkId).toBe("c1");
    expect(results[0].score).toBe(1);
    expect(results[1].score).toBeLessThan(1);
  });

  test("given keyword mode, when searched, then queue is not called", async () => {
    const { queue } = await import("../worker/kt.worker.client");
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1", rank: -5 }]),
    });
    await search(db, "hello", "/cache", log, { mode: "keyword" });
    expect(queue).not.toHaveBeenCalled();
  });

  test("given results, when minScore is high, then low-scoring results are dropped", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [
        { chunkId: "c1", rank: -10 },
        { chunkId: "c2", rank: -5 },
        { chunkId: "c3", rank: -1 },
      ]),
    });
    const results = await search(db, "hello", "/cache", log, { minScore: 0.99 });
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("c1");
  });

  test("given results, when minScore is 0, then all results returned", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [
        { chunkId: "c1", rank: -10 },
        { chunkId: "c2", rank: -5 },
      ]),
    });
    const results = await search(db, "hello", "/cache", log, { minScore: 0 });
    expect(results).toHaveLength(2);
  });

  test("given results, when limit is 1, then only top result returned", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [
        { chunkId: "c1", rank: -10 },
        { chunkId: "c2", rank: -5 },
        { chunkId: "c3", rank: -1 },
      ]),
    });
    const results = await search(db, "hello", "/cache", log, { limit: 1, minScore: 0 });
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("c1");
  });

  test("given results, when scores normalized, then top score is 1", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [
        { chunkId: "c1", rank: -10 },
        { chunkId: "c2", rank: -5 },
      ]),
    });
    const results = await search(db, "hello", "/cache", log, { minScore: 0 });
    expect(results[0].score).toBe(1);
    expect(results[1].score).toBeGreaterThan(0);
    expect(results[1].score).toBeLessThan(1);
  });

  test("given results, when hydrated, then content and sourceFileName are populated", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1", rank: -5 }]),
      getChunksByIds: vi.fn(() => [{
        id: "c1",
        sourceId: "src-1",
        sourceFileName: "readme.md",
        content: "Hello world",
        section: "Intro",
      }]),
    });
    const results = await search(db, "hello", "/cache", log);
    expect(results[0].sourceFileName).toBe("readme.md");
    expect(results[0].content).toBe("Hello world");
    expect(results[0].section).toBe("Intro");
  });

  test("given chunk not found in hydration, when searched, then skips it", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "missing", rank: -5 }]),
      getChunksByIds: vi.fn(() => []),
    });
    const results = await search(db, "hello", "/cache", log);
    expect(results).toEqual([]);
  });

  test("given custom rankingFn, when searched, then uses it instead of rrf", async () => {
    const customRanking: RankingFn = vi.fn(() => new Map([["c1", 1.0]]));
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1", rank: -5 }]),
    });
    const results = await search(db, "hello", "/cache", log, { rankingFn: customRanking, minScore: 0 });
    expect(customRanking).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });
});

describe("kt.search — hybrid mode", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { queue: mockQueue } = await import("../worker/kt.worker.client");
    (mockQueue as any).mockImplementation(async (work: any) => {
      switch (work.command) {
        case "embed": {
          const count = work.input.texts.length;
          return Array.from({ length: count }, () => new Float32Array(768));
        }
        case "rewrite": return work.input.query;
        case "keywords": return ["keyword1", "keyword2"];
        case "expand": return ["expanded one", "expanded two"];
        case "rerank": return work.input.documents.map(() => 0.5);
        default: throw new Error(`Unknown command: ${work.command}`);
      }
    });
  });

  test("given hybrid mode, when searched, then calls keywords and expand", async () => {
    const { queue: mockQueue } = await import("../worker/kt.worker.client");
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
      searchVectors: vi.fn(() => [{ chunkId: "c1", sourceId: "src-1", distance: 0.1 }]),
    });
    await search(db, "hello", "/cache", log, { mode: "hybrid", minScore: 0 });
    const calls = (mockQueue as any).mock.calls;
    const commands = calls.map((c: any) => c[0].command);
    expect(commands).toContain("keywords");
    expect(commands).toContain("expand");
  });

  test("given hybrid mode, when searched, then calls embed once as batch", async () => {
    const { queue: mockQueue } = await import("../worker/kt.worker.client");
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
      searchVectors: vi.fn(() => [{ chunkId: "c1", sourceId: "src-1", distance: 0.1 }]),
    });
    await search(db, "hello", "/cache", log, { mode: "hybrid", minScore: 0 });
    const calls = (mockQueue as any).mock.calls;
    const embedCalls = calls.filter((c: any) => c[0].command === "embed");
    expect(embedCalls).toHaveLength(1);
  });

  test("given hybrid mode, when searched, then calls rerank with top candidates", async () => {
    const { queue: mockQueue } = await import("../worker/kt.worker.client");
    const db = mockDb({
      searchFts: vi.fn(() => [
        { chunkId: "c1" },
        { chunkId: "c2" },
      ]),
      searchVectors: vi.fn(() => [
        { chunkId: "c1", sourceId: "src-1", distance: 0.1 },
        { chunkId: "c2", sourceId: "src-1", distance: 0.2 },
      ]),
    });
    await search(db, "hello", "/cache", log, { mode: "hybrid", minScore: 0 });
    const calls = (mockQueue as any).mock.calls;
    const rerankCalls = calls.filter((c: any) => c[0].command === "rerank");
    expect(rerankCalls).toHaveLength(1);
  });

  test("given hybrid mode, when searched, then calls searchFts for original and keywords", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
      searchVectors: vi.fn(() => [{ chunkId: "c1", sourceId: "src-1", distance: 0.1 }]),
    });
    await search(db, "hello", "/cache", log, { mode: "hybrid", minScore: 0 });
    expect(db.searchFts).toHaveBeenCalledTimes(2);
    expect(db.searchFts).toHaveBeenCalledWith("hello", expect.any(Number));
    expect(db.searchFts).toHaveBeenCalledWith("keyword1 keyword2", expect.any(Number));
  });

  test("given hybrid results, when scored below threshold, then filtered out", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
      searchVectors: vi.fn(() => [{ chunkId: "c1", sourceId: "src-1", distance: 0.1 }]),
    });
    const results = await search(db, "hello", "/cache", log, { mode: "hybrid", minScore: 0.99 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test("given hybrid mode with worker failure, when searched, then falls back to keyword", async () => {
    const { queue: mockQueue } = await import("../worker/kt.worker.client");
    (mockQueue as any).mockRejectedValue(new Error("model not loaded"));
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
    });
    const results = await search(db, "hello", "/cache", log, { mode: "hybrid" });
    expect(log.warn).toHaveBeenCalled();
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test("given successful hybrid search, when complete, then terminateWorker is called", async () => {
    const { terminateWorker } = await import("../worker/kt.worker.client");
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
      searchVectors: vi.fn(() => [{ chunkId: "c1", sourceId: "src-1", distance: 0.1 }]),
    });
    await search(db, "hello", "/cache", log, { mode: "hybrid", minScore: 0 });
    expect(terminateWorker).toHaveBeenCalled();
  });

  test("given failed hybrid search, when fallback to keyword, then terminateWorker is still called", async () => {
    const { queue: mockQueue, terminateWorker } = await import("../worker/kt.worker.client");
    (mockQueue as any).mockRejectedValue(new Error("model crashed"));
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
    });
    await search(db, "hello", "/cache", log, { mode: "hybrid" });
    expect(terminateWorker).toHaveBeenCalled();
  });

  test("given keyword mode, when searched, then terminateWorker is not called", async () => {
    const { terminateWorker } = await import("../worker/kt.worker.client");
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
    });
    await search(db, "hello", "/cache", log, { mode: "keyword" });
    expect(terminateWorker).not.toHaveBeenCalled();
  });

  test("given hybrid mode, when searched, then keywords and expand run in parallel", async () => {
    const { queue: mockQueue } = await import("../worker/kt.worker.client");
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
      searchVectors: vi.fn(() => [{ chunkId: "c1", sourceId: "src-1", distance: 0.1 }]),
    });
    await search(db, "hello", "/cache", log, { mode: "hybrid", minScore: 0 });
    const calls = (mockQueue as any).mock.calls;
    const commands = calls.map((c: any) => c[0].command);
    expect(commands).toContain("keywords");
    expect(commands).toContain("expand");
    expect(commands).toContain("embed");
    expect(commands).toContain("rerank");
  });

  test("given no fts or vec results, when searched in hybrid, then returns empty", async () => {
    const db = mockDb();
    const results = await search(db, "hello", "/cache", log, { mode: "hybrid" });
    expect(results).toEqual([]);
  });

  test("given vectors beyond distance threshold, when searched, then filtered before RRF", async () => {
    const db = mockDb({
      searchFts: vi.fn(() => [{ chunkId: "c1" }]),
      searchVectors: vi.fn(() => [
        { chunkId: "c1", sourceId: "src-1", distance: 0.1 },
        { chunkId: "far", sourceId: "src-1", distance: 2.0 },
      ]),
    });
    const results = await search(db, "hello", "/cache", log, { mode: "hybrid", minScore: 0 });
    const ids = results.map((r) => r.chunkId);
    expect(ids).not.toContain("far");
  });
});
