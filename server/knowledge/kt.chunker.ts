/**
 * Boundary-aware text chunker with section support.
 * Splits text into overlapping chunks of ~CHUNK_SIZE chars (~500 tokens).
 */
import { estimateTokens } from "../tokens";

const CHUNK_SIZE = 2000;     // ~500 tokens
const OVERLAP = 200;         // ~50 tokens (10%)
const MIN_CHUNK = 200;       // ~50 tokens — merge tiny trailing chunks

export interface ChunkResult {
  content: string;
  startOffset: number;
  endOffset: number;
  tokenEstimate: number;
  section?: string;
}

interface Section {
  offset: number;
  label?: string;
}

/**
 * Chunk text into overlapping pieces, respecting section boundaries.
 * If sections are provided, each section is chunked independently.
 */
export function chunkText(
  text: string,
  sections?: Section[],
): ChunkResult[] {
  if (!text || text.trim().length === 0) return [];

  if (!sections || sections.length === 0) {
    return chunkSegment(text, 0);
  }

  // Sort sections by offset
  const sorted = [...sections].sort((a, b) => a.offset - b.offset);

  const merged: { offset: number; end: number; label?: string }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].offset;
    const end = i + 1 < sorted.length ? sorted[i + 1].offset : text.length;
    const segLen = end - start;

    if (merged.length > 0 && (merged[merged.length - 1].end - merged[merged.length - 1].offset) + segLen <= CHUNK_SIZE) {
      merged[merged.length - 1].end = end;
    } else {
      merged.push({ offset: start, end, label: sorted[i].label });
    }
  }

  const results: ChunkResult[] = [];

  for (const seg of merged) {
    const segment = text.slice(seg.offset, seg.end);
    if (segment.trim().length === 0) continue;

    const chunks = chunkSegment(segment, seg.offset, seg.label);
    results.push(...chunks);
  }

  // Handle text before the first section
  if (sorted[0].offset > 0) {
    const before = text.slice(0, sorted[0].offset);
    if (before.trim().length > 0) {
      const chunks = chunkSegment(before, 0);
      results.unshift(...chunks);
    }
  }

  return results;
}

/**
 * Chunk a single segment (no section boundaries to respect).
 * Splits at paragraph > sentence > word boundaries.
 */
function chunkSegment(text: string, baseOffset: number, section?: string): ChunkResult[] {
  const chunks: ChunkResult[] = [];
  let pos = 0;

  while (pos < text.length) {
    const remaining = text.length - pos;
    if (remaining <= CHUNK_SIZE) {
      // Last piece — check if it should merge
      if (chunks.length > 0 && remaining < MIN_CHUNK) {
        // Merge into previous
        const prev = chunks[chunks.length - 1];
        prev.content = text.slice(prev.startOffset - baseOffset, pos + remaining);
        prev.endOffset = baseOffset + pos + remaining;
        prev.tokenEstimate = estimateTokens(prev.content);
      } else {
        chunks.push(makeChunk(text, pos, pos + remaining, baseOffset, section));
      }
      break;
    }

    // Find best split point within CHUNK_SIZE
    const end = findSplitPoint(text, pos, pos + CHUNK_SIZE);
    chunks.push(makeChunk(text, pos, end, baseOffset, section));

    // Advance with overlap
    pos = Math.max(pos + 1, end - OVERLAP);
  }

  return chunks;
}

/**
 * Find the best split point near `target`, preferring:
 * 1. Paragraph break (\n\n)
 * 2. Sentence break (. or ? or ! followed by space/newline)
 * 3. Word break (space)
 * 4. Hard cut at target
 */
function findSplitPoint(text: string, start: number, target: number): number {
  const window = text.slice(start, target);

  // 1. Last paragraph break
  const paraIdx = window.lastIndexOf("\n\n");
  if (paraIdx > window.length * 0.3) {
    return start + paraIdx + 2;
  }

  // 2. Last sentence break
  const sentenceRe = /[.!?]\s/g;
  let lastSentence = -1;
  let match: RegExpExecArray | null;
  while ((match = sentenceRe.exec(window)) !== null) {
    if (match.index > window.length * 0.3) {
      lastSentence = match.index;
    }
  }
  if (lastSentence >= 0) {
    return start + lastSentence + 2;
  }

  // 3. Last word break
  const spaceIdx = window.lastIndexOf(" ");
  if (spaceIdx > window.length * 0.3) {
    return start + spaceIdx + 1;
  }

  // 4. Hard cut
  return target;
}

function makeChunk(text: string, start: number, end: number, baseOffset: number, section?: string): ChunkResult {
  const content = text.slice(start, end);
  return {
    content,
    startOffset: baseOffset + start,
    endOffset: baseOffset + end,
    tokenEstimate: estimateTokens(content),
    section,
  };
}
