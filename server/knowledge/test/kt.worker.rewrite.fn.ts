/**
 * Mock rewrite function for testing. Returns a prefixed query.
 */
import * as queryFn from "./kt.worker.query.fn";

export async function init(cacheDir: string): Promise<void> {
  await queryFn.init(cacheDir);
}

export async function rewrite(query: string): Promise<string> {
  return queryFn.prompt("rewrite", query);
}

export async function dispose(): Promise<void> {
  await queryFn.dispose();
}
