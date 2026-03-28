/**
 * Boundary-aware text chunker with section support.
 * Splits text into overlapping chunks of ~CHUNK_SIZE chars (~500 tokens).
 */
import { estimateTokens } from "../tokens";

const CHUNK_SIZE = 2000;
const OVERLAP = 200;
const MIN_CHUNK = 200;

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

interface SectionSlice {
  offset: number;
  end: number;
  label?: string;
}

export function chunkText(
  text: string,
  sections?: Section[],
): ChunkResult[] {
  return [...chunkTextStream(text, sections)];
}

export function* chunkTextStream(
  text: string,
  sections?: Section[],
): Generator<ChunkResult> {
  if (!text || text.trim().length === 0) return;

  if (!sections || sections.length === 0) {
    yield* chunkSegmentStream(text, 0);
    return;
  }

  const sorted = [...sections].sort((a, b) => a.offset - b.offset);
  const merged = mergeSections(text, sorted);

  if (sorted[0].offset > 0) {
    const before = text.slice(0, sorted[0].offset);
    if (before.trim().length > 0) {
      yield* chunkSegmentStream(before, 0);
    }
  }

  for (const seg of merged) {
    const segment = text.slice(seg.offset, seg.end);
    if (segment.trim().length === 0) continue;
    yield* chunkSegmentStream(segment, seg.offset, seg.label);
  }
}

function mergeSections(text: string, sorted: Section[]): SectionSlice[] {
  const merged: SectionSlice[] = [];

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

  return merged;
}

function* chunkSegmentStream(text: string, baseOffset: number, section?: string): Generator<ChunkResult> {
  let pos = 0;
  let prev: ChunkResult | null = null;

  while (pos < text.length) {
    const remaining = text.length - pos;

    if (remaining <= CHUNK_SIZE) {
      if (prev && remaining < MIN_CHUNK) {
        const mergedContent = text.slice(prev.startOffset - baseOffset, pos + remaining);
        prev.content = mergedContent;
        prev.endOffset = baseOffset + pos + remaining;
        prev.tokenEstimate = estimateTokens(mergedContent);
      } else {
        const chunk = makeChunk(text, pos, pos + remaining, baseOffset, section);
        if (prev) yield prev;
        prev = chunk;
      }
      break;
    }

    const end = findSplitPoint(text, pos, pos + CHUNK_SIZE);
    const chunk = makeChunk(text, pos, end, baseOffset, section);

    if (prev) yield prev;
    prev = chunk;

    pos = Math.max(pos + 1, end - OVERLAP);
  }

  if (prev) yield prev;
}

function findSplitPoint(text: string, start: number, target: number): number {
  const window = text.slice(start, target);

  const paraIdx = window.lastIndexOf("\n\n");
  if (paraIdx > window.length * 0.3) {
    return start + paraIdx + 2;
  }

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

  const spaceIdx = window.lastIndexOf(" ");
  if (spaceIdx > window.length * 0.3) {
    return start + spaceIdx + 1;
  }

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
