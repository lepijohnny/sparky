/** Rough token estimate: ~4 characters per token. Will be replaced with a precise tokenizer later. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
