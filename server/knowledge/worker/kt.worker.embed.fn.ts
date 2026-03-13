/**
 * Embed function — loads nomic-embed-text-v1.5 GGUF via node-llama-cpp.
 * Lazy-loaded on first embed() call.
 */
import { getLlamaInstance } from "./kt.worker.llama";

const BATCH = 32;
const MODEL_FILE = "nomic-embed-text-v1.5.Q4_0.gguf";

let model: any = null;
let ctx: any = null;

export async function init(cacheDir: string): Promise<void> {
  if (ctx) return;
  const llama = await getLlamaInstance();
  const { join } = await import("node:path");
  model = await llama.loadModel({ modelPath: join(cacheDir, MODEL_FILE) });
  ctx = await model.createEmbeddingContext();
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (!ctx) throw new Error("Embed model not initialized");
  const vectors: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((text) => ctx.getEmbeddingFor(text)),
    );
    for (const r of results) {
      vectors.push(Array.from(r.vector));
    }
  }

  return vectors;
}

export async function dispose(): Promise<void> {
  if (ctx) { await ctx.dispose(); ctx = null; }
  if (model) { await model.dispose(); model = null; }
}
