/**
 * Mock embed function for testing. Returns deterministic fake vectors.
 * Supports artificial delay via MOCK_DELAY_MS environment variable.
 */

const DIMS = 768;
const DELAY = parseInt(process.env.MOCK_DELAY_MS ?? "10", 10);

function fakeVector(text: string): number[] {
  const vec = new Array(DIMS).fill(0);
  for (let i = 0; i < text.length && i < DIMS; i++) vec[i] = text.charCodeAt(i) / 255;
  return vec;
}

export async function init(): Promise<void> {}

export async function embed(texts: string[]): Promise<number[][]> {
  await new Promise((r) => setTimeout(r, DELAY));
  return texts.map(fakeVector);
}

export async function dispose(): Promise<void> {}
