/**
 * Reciprocal Rank Fusion — merges N ranked result lists into a
 * single score map. Each list can have a weight multiplier.
 *
 * Used for both keyword-only (1 list) and hybrid (6 lists with
 * original query getting ×2 weight).
 */

const RRF_K = 60;

export interface RankedHit {
  chunkId: string;
}

export type RankingFn = (lists: RankedHit[][], weights?: number[]) => Map<string, number>;

export function rrf(lists: RankedHit[][], weights?: number[]): Map<string, number> {
  const scores = new Map<string, number>();

  for (let li = 0; li < lists.length; li++) {
    const w = weights?.[li] ?? 1;
    const list = lists[li];
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank].chunkId;
      scores.set(id, (scores.get(id) ?? 0) + w / (RRF_K + rank + 1));
    }
  }

  return scores;
}
