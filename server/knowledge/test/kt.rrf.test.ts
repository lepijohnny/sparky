import { describe, test, expect } from "vitest";
import { rrf, type RankedHit } from "../kt.rrf";

describe("kt.rrf", () => {
  test("given empty lists, when fused, then returns empty map", () => {
    const result = rrf([]);
    expect(result.size).toBe(0);
  });

  test("given single list, when fused, then all chunks have scores", () => {
    const list: RankedHit[] = [
      { chunkId: "a" },
      { chunkId: "b" },
      { chunkId: "c" },
    ];
    const result = rrf([list]);
    expect(result.size).toBe(3);
    expect(result.has("a")).toBe(true);
    expect(result.has("b")).toBe(true);
    expect(result.has("c")).toBe(true);
  });

  test("given single list, when fused, then first rank scores higher than last", () => {
    const list: RankedHit[] = [
      { chunkId: "first" },
      { chunkId: "last" },
    ];
    const result = rrf([list]);
    expect(result.get("first")!).toBeGreaterThan(result.get("last")!);
  });

  test("given single result in single list, when fused, then score is 1/61", () => {
    const result = rrf([[{ chunkId: "a" }]]);
    expect(result.get("a")).toBeCloseTo(1 / 61);
  });

  test("given many results, when fused, then scores decrease monotonically", () => {
    const list = Array.from({ length: 20 }, (_, i) => ({ chunkId: `c-${i}` }));
    const result = rrf([list]);
    for (let i = 0; i < 19; i++) {
      expect(result.get(`c-${i}`)!).toBeGreaterThan(result.get(`c-${i + 1}`)!);
    }
  });

  test("given two disjoint lists, when fused, then all chunks present", () => {
    const a: RankedHit[] = [{ chunkId: "a" }, { chunkId: "b" }];
    const b: RankedHit[] = [{ chunkId: "c" }, { chunkId: "d" }];
    const result = rrf([a, b]);
    expect(result.size).toBe(4);
  });

  test("given chunk in two lists, when fused, then scores higher than single-list chunk", () => {
    const a: RankedHit[] = [{ chunkId: "both" }, { chunkId: "a-only" }];
    const b: RankedHit[] = [{ chunkId: "both" }, { chunkId: "b-only" }];
    const result = rrf([a, b]);
    expect(result.get("both")!).toBeGreaterThan(result.get("a-only")!);
    expect(result.get("both")!).toBeGreaterThan(result.get("b-only")!);
  });

  test("given weighted lists, when fused, then weight multiplies scores", () => {
    const a: RankedHit[] = [{ chunkId: "a" }];
    const b: RankedHit[] = [{ chunkId: "b" }];
    const unweighted = rrf([a, b]);
    const weighted = rrf([a, b], [2, 1]);
    expect(weighted.get("a")!).toBeGreaterThan(unweighted.get("a")!);
    expect(weighted.get("b")!).toBe(unweighted.get("b")!);
  });

  test("given 6 lists with weights, when fused, then original-weighted chunk dominates", () => {
    const original: RankedHit[] = [{ chunkId: "top" }];
    const rewritten: RankedHit[] = [{ chunkId: "other" }];
    const expanded: RankedHit[] = [{ chunkId: "other" }];
    const vecOriginal: RankedHit[] = [{ chunkId: "top" }];
    const vecRewritten: RankedHit[] = [{ chunkId: "other" }];
    const vecExpanded: RankedHit[] = [{ chunkId: "other" }];
    const result = rrf(
      [original, rewritten, expanded, vecOriginal, vecRewritten, vecExpanded],
      [2, 1, 1, 2, 1, 1],
    );
    expect(result.get("top")!).toBeGreaterThan(result.get("other")! * 0.5);
  });
});
