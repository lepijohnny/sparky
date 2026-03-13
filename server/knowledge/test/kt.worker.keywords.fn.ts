/**
 * Mock keywords function for testing. Splits query into words >2 chars.
 */
import * as queryFn from "./kt.worker.query.fn";

export async function init(cacheDir: string): Promise<void> {
  await queryFn.init(cacheDir);
}

export async function keywords(query: string): Promise<string[]> {
  const result = await queryFn.prompt("keywords", query);
  return result.split(",").map((k) => k.trim()).filter((k) => k.length > 0);
}

export async function dispose(): Promise<void> {
  await queryFn.dispose();
}
