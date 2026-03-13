/**
 * Mock rerank function for testing. Returns decreasing scores.
 */

const DELAY = parseInt(process.env.MOCK_DELAY_MS ?? "10", 10);

export async function init(): Promise<void> {}

export async function rerank(query: string, documents: string[]): Promise<number[]> {
  await new Promise((r) => setTimeout(r, DELAY));
  return documents.map((_, i) => Math.max(0, 1 - i * 0.1));
}

export async function dispose(): Promise<void> {}
