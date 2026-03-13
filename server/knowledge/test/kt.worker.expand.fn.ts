/**
 * Mock expand function for testing. Returns two alternative queries.
 */
import * as queryFn from "./kt.worker.query.fn";

export async function init(cacheDir: string): Promise<void> {
  await queryFn.init(cacheDir);
}

export async function expand(query: string): Promise<string[]> {
  const result = await queryFn.prompt("expand", query);
  return result.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
}

export async function dispose(): Promise<void> {
  await queryFn.dispose();
}
