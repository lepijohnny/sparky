/**
 * Knowledge search — keyword-only or full hybrid pipeline.
 *
 * Keyword mode: BM25 only, no worker, no models.
 *
 * Hybrid mode:
 *   1. Keywords(query) → extract search keywords
 *   2. Expand(query) → semantic expansion terms
 *   3. BM25(original) + BM25(keywords)
 *   4. Embed([original, ...expanded]) → batch embed
 *   5. Vector(original) + Vector(expanded...) → vector searches
 *   6. RRF(BM25 + vector lists, weighted) → top-20
 *   7. Rerank(query, chunks) → filter ≥ threshold
 */
import type { Logger } from "../logger.types";
import type { KtDatabase } from "./kt.db";
import type { SearchResult } from "./kt.types";
import type { RankingFn } from "./kt.rrf";
import { rrf } from "./kt.rrf";
import {
  queue, Embed, Keywords, Expand, Rewrite, Rerank, terminateWorker,
} from "./worker/kt.worker.client";

const DEFAULT_LIMIT = 10;
const DEFAULT_MIN_SCORE = 0.3;
const CANDIDATE_MULTIPLIER = 5;
const MAX_VECTOR_DISTANCE = 1.2;
const RERANK_CANDIDATES = 20;
const MAX_RERANK_CHUNKS = 15;

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  mode?: "keyword" | "hybrid";
  rankingFn?: RankingFn;
}

export async function search(
  db: KtDatabase,
  query: string,
  cacheDir: string,
  log: Logger,
  opts: SearchOptions = {},
): Promise<SearchResult[]> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const minScore = opts.minScore ?? DEFAULT_MIN_SCORE;
  const mode = opts.mode ?? "keyword";
  const rank = opts.rankingFn ?? rrf;
  const candidates = limit * CANDIDATE_MULTIPLIER;

  if (mode === "keyword") {
    const ftsResults = db.searchFts(query, candidates);
    const scores = rank([ftsResults]);
    return buildResults(db, scores, limit, minScore);
  }

  try {
    return await hybridSearch(db, query, cacheDir, log, rank, candidates, limit, minScore);
  } catch (err) {
    log.warn("Hybrid search failed, falling back to keyword", { error: String(err) });
    const ftsResults = db.searchFts(query, candidates);
    const scores = rank([ftsResults]);
    return buildResults(db, scores, limit, minScore);
  } finally {
    terminateWorker();
  }
}

async function hybridSearch(
  db: KtDatabase,
  query: string,
  cacheDir: string,
  log: Logger,
  rank: RankingFn,
  candidates: number,
  limit: number,
  minScore: number,
): Promise<SearchResult[]> {
  const rewritten = await queue(Rewrite(query), cacheDir, log);
  log.debug("Query rewrite", { original: query, rewritten });

  const [extracted, expanded] = await Promise.all([
    queue(Keywords(rewritten), cacheDir, log),
    queue(Expand(rewritten), cacheDir, log),
  ]);

  const keywordsJoined = extracted.join(" ");

  log.debug("Query analysis", { rewritten, keywords: extracted, expanded, candidates });

  const ftsOriginal = db.searchFts(rewritten, candidates);
  const ftsKeywords = keywordsJoined.length > 0 ? db.searchFts(keywordsJoined, candidates) : [];

  log.debug("BM25 results", {
    original: ftsOriginal.length,
    keywords: ftsKeywords.length,
    totalUnique: new Set([...ftsOriginal, ...ftsKeywords].map((r) => r.chunkId)).size,
  });

  const textsToEmbed = [rewritten, ...expanded];
  const vectors = await queue(Embed(textsToEmbed, "high"), cacheDir, log);

  const vecLists: { chunkId: string }[][] = [];
  for (let i = 0; i < vectors.length; i++) {
    const results = db.searchVectors(vectors[i], candidates)
      .filter((r) => r.distance <= MAX_VECTOR_DISTANCE)
      .map((r) => ({ chunkId: r.chunkId }));
    vecLists.push(results);
  }

  const allLists = [ftsOriginal, ftsKeywords, ...vecLists];
  const weights = [2, 1, 2, ...expanded.map(() => 1)];

  const rrfScores = rank(allLists, weights);

  const sorted = [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return [];

  const allIds = sorted.map(([id]) => id);
  const allChunks = db.getChunksByIds(allIds);
  const chunkMap = new Map(allChunks.map((c) => [c.id, c]));

  const selectedFiles = new Set<string>();
  const rerankChunks: typeof allChunks = [];
  for (const [id] of sorted) {
    if (rerankChunks.length >= MAX_RERANK_CHUNKS) break;
    const chunk = chunkMap.get(id);
    if (!chunk) continue;
    if (!selectedFiles.has(chunk.sourceFileName)) {
      if (selectedFiles.size >= RERANK_CANDIDATES) continue;
      selectedFiles.add(chunk.sourceFileName);
    }
    rerankChunks.push(chunk);
  }

  if (rerankChunks.length === 0) return [];

  const rerankScores = await queue(
    Rerank(rewritten, rerankChunks.map((c) => c.content)),
    cacheDir, log,
  );

  const chunkScores: { id: string; fileName: string; score: number }[] = [];
  for (let i = 0; i < rerankChunks.length; i++) {
    chunkScores.push({
      id: rerankChunks[i].id,
      fileName: rerankChunks[i].sourceFileName,
      score: rerankScores[i],
    });
  }
  chunkScores.sort((a, b) => b.score - a.score);

  const scoredChunks = new Map<string, number>();
  for (const { id, score } of chunkScores) {
    scoredChunks.set(id, score);
  }

  log.debug("Hybrid search scores", {
    query,
    keywords: extracted,
    expanded,
    candidates: rerankChunks.length,
    files: selectedFiles.size,
    top: [...scoredChunks.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, rerank]) => ({
        chunk: id.slice(0, 8),
        rerank: Math.round(rerank * 1000) / 1000,
        rrf: Math.round((rrfScores.get(id) ?? 0) * 1000) / 1000,
      })),
  });

  return buildResultsFromScores(db, chunkMap, scoredChunks, limit, minScore);
}

function buildResults(
  db: KtDatabase,
  scores: Map<string, number>,
  limit: number,
  minScore: number,
): SearchResult[] {
  if (scores.size === 0) return [];

  const sorted = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  const topScore = sorted[0][1];
  if (topScore === 0) return [];

  const normalized: { chunkId: string; score: number }[] = [];
  for (const [chunkId, raw] of sorted) {
    const score = raw / topScore;
    if (score >= minScore) normalized.push({ chunkId, score });
  }

  if (normalized.length === 0) return [];

  const chunkIds = normalized.map((r) => r.chunkId);
  const chunks = db.getChunksByIds(chunkIds);
  const chunkMap = new Map(chunks.map((c) => [c.id, c]));

  const results: SearchResult[] = [];
  for (const { chunkId, score } of normalized) {
    const chunk = chunkMap.get(chunkId);
    if (!chunk) continue;
    results.push({
      chunkId,
      sourceId: chunk.sourceId,
      sourceFileName: chunk.sourceFileName,
      content: chunk.content,
      section: chunk.section ?? undefined,
      score,
    });
  }

  return results;
}

function buildResultsFromScores(
  db: KtDatabase,
  chunkMap: Map<string, { id: string; sourceId: string; sourceFileName: string; content: string; section: string | null }>,
  scores: Map<string, number>,
  limit: number,
  minScore: number,
): SearchResult[] {
  const sorted = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .filter(([, score]) => score >= minScore)
    .slice(0, limit);

  const seen = new Set<string>();
  const results: SearchResult[] = [];

  for (const [chunkId, score] of sorted) {
    const neighbors = db.getAdjacentChunks(chunkId);
    for (const chunk of neighbors) {
      if (seen.has(chunk.id)) continue;
      seen.add(chunk.id);
      results.push({
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        sourceFileName: chunk.sourceFileName,
        content: chunk.content,
        section: chunk.section ?? undefined,
        score: chunk.id === chunkId ? score : score * 0.9,
      });
    }
  }

  return results;
}
