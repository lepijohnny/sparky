/**
 * Expand — generates alternative search queries for broader retrieval.
 */
import * as queryFn from "./kt.worker.query.fn";

const SYSTEM = "Generate 2-3 short search phrases to find documents related to the user's query. Output one phrase per line. Use only keywords and noun phrases. No numbering, no quotes, no instructions, no full sentences.";

export async function init(cacheDir: string): Promise<void> {
  await queryFn.init(cacheDir);
}

export async function expand(query: string): Promise<string[]> {
  const result = await queryFn.prompt(SYSTEM, query, 128);
  return result
    .split("\n")
    .map((l) => l.replace(/^\d+[\.\)]\s*/, "").replace(/^[-•*]\s*/, "").replace(/["'"]/g, "").trim())
    .filter((l) => l.length > 0);
}

export async function dispose(): Promise<void> {
  await queryFn.dispose();
}
