import { extname } from "node:path";
import { Markit } from "markit-ai";
import type { ExtractionResult, FileMdConverter } from "../knowledge/kt.types";

/**
 * Extensions supported by markit's built-in converters (excluding images).
 * Mirrors the converter EXTENSIONS arrays in markit-ai source.
 */
const MARKIT_EXTENSIONS = new Set([
  "pdf",
  "docx",
  "pptx",
  "xlsx",
  "csv", "tsv",
  "html", "htm",
  "epub",
  "ipynb",
  "json",
  "yaml", "yml",
  "xml", "svg",
  "zip",
  "txt", "md", "markdown", "rst", "log", "cfg", "ini", "toml", "env",
  "sh", "bash", "zsh", "fish",
  "py", "js", "ts", "jsx", "tsx",
  "go", "rs", "rb", "java",
  "c", "cpp", "h", "hpp", "cs",
  "swift", "kt", "scala", "sql",
  "r", "m", "lua", "pl", "php",
  "ex", "exs", "zig", "nim", "v", "d", "hs", "ml", "clj",
  "makefile", "dockerfile",
  "rss", "atom",
]);

/** All extensions accepted as attachments: markit-convertible formats */
export function supportedAttachmentExtensions(): string[] {
  return [...MARKIT_EXTENSIONS];
}

const MAX_LINES_PER_SEGMENT = 500;
const MAX_CHARS_PER_SEGMENT = 200_000;

interface Heading {
  offset: number;
  label?: string;
}

export function recognizeMarkdownSegments(text: string): Heading[] {
  const sections: Heading[] = [];
  const re = /^(#{1,3})\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    sections.push({ offset: match.index, label: match[2].trim() });
  }
  return sections;
}

function headingLevelAt(text: string, offset: number): number {
  let i = offset;
  let level = 0;
  while (i < text.length && text.charCodeAt(i) === 0x23) {
    level++;
    i++;
  }
  return level;
}

export async function* splitIntoSegments(text: string, sections: Heading[]): AsyncGenerator<string> {
  if (sections.length < 2) {
    yield text;
    return;
  }

  const topLevel = sections.filter((s) => headingLevelAt(text, s.offset) <= 2);
  const splits = topLevel.length >= 2 ? topLevel : sections;

  if (splits[0].offset > 0) {
    const preamble = text.slice(0, splits[0].offset).trim();
    if (preamble.length > 0) yield preamble;
  }

  for (let i = 0; i < splits.length; i++) {
    const start = splits[i].offset;
    const end = i + 1 < splits.length ? splits[i + 1].offset : text.length;
    const segment = text.slice(start, end).trim();
    if (segment.length > 0) yield segment;
  }
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  const core = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cols = core.split("|").map((c) => c.trim()).filter((c) => c.length > 0);
  if (cols.length === 0) return false;
  return cols.every((c) => /^:?-{3,}:?$/.test(c));
}

export function appendTableHeader(lines: string[], chunk: string[]): string {
  if (lines[0]?.startsWith("|") && isTableSeparator(lines[1] ?? "")) {
    return `${lines[0]}\n${lines[1]}\n${chunk.join("\n")}`;
  }
  return chunk.join("\n");
}

function splitByChars(text: string): string[] {
  if (text.length <= MAX_CHARS_PER_SEGMENT) return [text];
  const parts: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const end = Math.min(pos + MAX_CHARS_PER_SEGMENT, text.length);
    parts.push(text.slice(pos, end).trim());
    pos = end;
  }
  return parts.filter((p) => p.length > 0);
}

export function splitByLines(text: string, extension = ".md"): string[] {
  const lines = text.split("\n");
  const isCsvLike = extension === ".csv" || extension === ".tsv";

  if (!isCsvLike && lines.length <= MAX_LINES_PER_SEGMENT && text.length <= MAX_CHARS_PER_SEGMENT) {
    return [text];
  }

  if (lines.length <= 1) {
    return splitByChars(text);
  }

  const dataStart = (lines[0]?.startsWith("|") && isTableSeparator(lines[1] ?? "")) ? 2 : 0;
  const dataLines = lines.slice(dataStart);
  const groups: string[] = [];

  for (let i = 0; i < dataLines.length; i += MAX_LINES_PER_SEGMENT) {
    const chunk = dataLines.slice(i, i + MAX_LINES_PER_SEGMENT);
    const merged = appendTableHeader(lines, chunk).trim();
    if (merged.length <= MAX_CHARS_PER_SEGMENT) {
      groups.push(merged);
    } else {
      groups.push(...splitByChars(merged));
    }
  }

  return groups.length > 0 ? groups : [text];
}

/**
 * Creates a FileMdConverter backed by markit.
 * When maxOutputChars is set, throws on documents exceeding the limit.
 * Without a limit, yields the full conversion (suitable for knowledge pipeline chunking).
 */
export function getFileToMarkdownConverter(options?: { maxOutputChars?: number }): FileMdConverter {
  const markit = new Markit();
  const limit = options?.maxOutputChars;

  return {
    name: "built-in markit converter",
    extensions: [...MARKIT_EXTENSIONS].map((e) => `.${e}`),
    async *extract(target: string, log: (msg: string) => void): AsyncGenerator<ExtractionResult> {
      const result = await markit.convertFile(target);
      if (limit && result.markdown.length > limit) {
        throw new Error(`Document too large (${result.markdown.length} chars, limit is ${limit}). Tell the user to add this file to the Knowledge Base in Sparky settings instead, where it will be chunked and searchable.`);
      }

      const text = result.markdown;
      const extension = extname(target).toLowerCase();
      const headings = recognizeMarkdownSegments(text);
      log(`Extraction started: ${target}, ${text.length} chars, ${headings.length} sections`);

      let yielded = 0;

      for await (const seg of splitIntoSegments(text, headings)) {
        for (const sub of splitByLines(seg, extension)) {
          const subSections = recognizeMarkdownSegments(sub).map((s) => ({ offset: s.offset, label: s.label }));
          yield { text: sub, sections: subSections.length > 0 ? subSections : undefined };
          yielded++;
        }
      }

      log(`Extraction finished: ${yielded} segments`);
    },
  };
}
