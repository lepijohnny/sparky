/**
 * Rerank function — uses bge-reranker-v2-m3 to score query-document pairs.
 * Returns absolute scores (sigmoid 0–1) per document.
 * Lazy-loaded on first rerank() call.
 */
import { getLlamaInstance } from "./kt.worker.llama";

const MODEL_FILE = "bge-reranker-v2-m3-Q4_K_M.gguf";

let model: any = null;
let ctx: any = null;

export async function init(cacheDir: string): Promise<void> {
  if (ctx) return;
  const llama = await getLlamaInstance();
  const { join } = await import("node:path");
  model = await llama.loadModel({ modelPath: join(cacheDir, MODEL_FILE) });
  ctx = await model.createRankingContext({ threads: 0 });
}

export async function rerank(query: string, documents: string[]): Promise<number[]> {
  if (!ctx) throw new Error("Rerank model not initialized");
  return ctx.rankAll(query, documents);
}

export async function dispose(): Promise<void> {
  if (ctx) { await ctx.dispose(); ctx = null; }
  if (model) { await model.dispose(); model = null; }
}
