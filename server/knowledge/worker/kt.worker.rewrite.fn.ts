/**
 * Rewrite — rewrites a search query into a precise retrieval query.
 */
import * as queryFn from "./kt.worker.query.fn";

const SYSTEM = "You are a search query optimizer for a document retrieval system. The input may include a topic, previous questions for context, and a current question. Rewrite into a single precise standalone search query that would match relevant passages in a knowledge base. Resolve pronouns and references using the context. Use specific keywords and terms likely to appear in documents. Do NOT answer the query. Return only the rewritten query, nothing else.";

export async function init(cacheDir: string): Promise<void> {
  await queryFn.init(cacheDir);
}

export async function rewrite(query: string): Promise<string> {
  return queryFn.prompt(SYSTEM, query, 64);
}

export async function dispose(): Promise<void> {
  await queryFn.dispose();
}
