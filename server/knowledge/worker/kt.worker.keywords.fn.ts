/**
 * Keywords — extracts search keywords optimized for BM25/FTS retrieval.
 */
import * as queryFn from "./kt.worker.query.fn";

const SYSTEM = "Extract 3-5 single-word search keywords from this query. Output only individual words separated by commas. No phrases, no multi-word terms, no explanations. Maximum 5 keywords.";

export async function init(cacheDir: string): Promise<void> {
  await queryFn.init(cacheDir);
}

export async function keywords(query: string): Promise<string[]> {
  const result = await queryFn.prompt(SYSTEM, query, 32);
  return result
    .split(",")
    .map((k) => k.replace(/["'"]/g, "").trim())
    .filter((k) => k.length > 0)
    .slice(0, 5);
}

export async function dispose(): Promise<void> {
  await queryFn.dispose();
}
