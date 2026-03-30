/**
 * MinHash signature for fast Jaccard similarity estimation.
 *
 * Generates a fixed-size signature (128 values) from a string by shingling
 * into word n-grams, hashing each shingle once, and deriving k min-values
 * using the formula: h1 + i * h2 (universal hashing trick).
 *
 * Comparing two signatures: matchCount / K ≈ Jaccard similarity.
 */

const K = 128;
const SHINGLE_SIZE = 4;

function hash32(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function computeSimilaritySignature(text: string): Uint32Array {
  const words = text.split(/\s+/);
  const sig = new Uint32Array(K).fill(0xffffffff);

  for (let i = 0; i <= words.length - SHINGLE_SIZE; i++) {
    const shingle = words.slice(i, i + SHINGLE_SIZE).join(" ");
    const h1 = hash32(shingle);
    const h2 = hash32(shingle + "\x00");

    for (let j = 0; j < K; j++) {
      const val = (h1 + Math.imul(j, h2)) >>> 0;
      if (val < sig[j]) sig[j] = val;
    }
  }

  return sig;
}

export function compareSimilaritySignatures(a: Uint32Array, b: Uint32Array): number {
  let matches = 0;
  for (let i = 0; i < K; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / K;
}

export function serializeSignature(sig: Uint32Array): Buffer {
  return Buffer.from(sig.buffer, sig.byteOffset, sig.byteLength);
}

export function deserializeSignature(buf: Buffer): Uint32Array {
  const arr = new Uint32Array(K);
  for (let i = 0; i < K; i++) {
    arr[i] = buf.readUInt32LE(i * 4);
  }
  return arr;
}
