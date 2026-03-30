import { describe, test, expect } from "vitest";
import { computeSimilaritySignature, compareSimilaritySignatures, serializeSignature, deserializeSignature } from "../tool.minhash";

describe("computeSignature", () => {
  test("given a string, when computing signature, then returns 128 values", () => {
    const sig = computeSimilaritySignature("the quick brown fox jumps over the lazy dog");
    expect(sig).toBeInstanceOf(Uint32Array);
    expect(sig.length).toBe(128);
  });

  test("given identical strings, when comparing signatures, then similarity is 1.0", () => {
    const text = "the quick brown fox jumps over the lazy dog and then some more words to fill";
    const a = computeSimilaritySignature(text);
    const b = computeSimilaritySignature(text);
    expect(compareSimilaritySignatures(a, b)).toBe(1.0);
  });

  test("given very similar strings, when comparing signatures, then similarity is above 0.8", () => {
    const shared = "the quick brown fox jumps over the lazy dog and runs through the field of wheat under the bright sun while birds sing in the trees and clouds drift across the blue sky above the rolling hills and green meadows stretching to the horizon where mountains rise and rivers flow through valleys deep and wide carrying leaves and branches downstream toward the distant ocean";
    const a = computeSimilaritySignature(shared + " ending alpha version one");
    const b = computeSimilaritySignature(shared + " ending beta version two");
    expect(compareSimilaritySignatures(a, b)).toBeGreaterThan(0.8);
  });

  test("given completely different strings, when comparing signatures, then similarity is low", () => {
    const a = computeSimilaritySignature("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau");
    const b = computeSimilaritySignature("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen");
    expect(compareSimilaritySignatures(a, b)).toBeLessThan(0.3);
  });
});

describe("serialize and deserialize", () => {
  test("given a signature, when round-tripping through serialize/deserialize, then values are preserved", () => {
    const sig = computeSimilaritySignature("some text with enough words to produce a meaningful signature for testing purposes here");
    const buf = serializeSignature(sig);
    const restored = deserializeSignature(buf);
    expect(compareSimilaritySignatures(sig, restored)).toBe(1.0);
  });

  test("given a signature, when serialized, then buffer is 512 bytes", () => {
    const sig = computeSimilaritySignature("a b c d e f g h i j k l m n o p q r s t u v w x y z");
    const buf = serializeSignature(sig);
    expect(buf.byteLength).toBe(128 * 4);
  });
});
