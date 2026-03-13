/**
 * Shared query model — loads qwen2.5-1.5b-instruct once, provides a
 * generic prompt() helper that rewrite, expand, and keywords all use
 * with different system prompts.
 */
import { getLlamaInstance } from "./kt.worker.llama";

const MODEL_FILE = "qwen2.5-1.5b-instruct-q4_k_m.gguf";

let model: any = null;
let ctx: any = null;

export async function init(cacheDir: string): Promise<void> {
  if (ctx) return;
  const llama = await getLlamaInstance();
  const { join } = await import("node:path");
  model = await llama.loadModel({ modelPath: join(cacheDir, MODEL_FILE) });
  ctx = await model.createContext();
}

export async function prompt(systemPrompt: string, query: string, maxTokens: number): Promise<string> {
  if (!ctx) throw new Error("Query model not initialized");
  const { LlamaChatSession } = await import("node-llama-cpp");
  const seq = ctx.getSequence();
  const session = new LlamaChatSession({ contextSequence: seq });
  const result = await session.prompt(
    `${systemPrompt}\n\nQuery: ${query}`,
    { maxTokens },
  );
  session.dispose();
  seq.dispose();
  return result.trim();
}

export async function dispose(): Promise<void> {
  if (ctx) { await ctx.dispose(); ctx = null; }
  if (model) { await model.dispose(); model = null; }
}
