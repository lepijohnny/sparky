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

/**
 * Parse markdown heading sections from text.
 * Used by the knowledge extractor to enable section-aware chunking.
 */
function parseSections(text: string): { offset: number; label?: string }[] {
  const sections: { offset: number; label?: string }[] = [];
  const re = /^#{1,3}\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    sections.push({ offset: match.index, label: match[1].trim() });
  }
  return sections;
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
      const sections = parseSections(text);
      log(`Extraction started: ${target}, ${text.length} chars, ${sections.length} sections`);

      if (sections.length < 2 || text.length < 50_000) {
        yield { text, sections: sections.length > 0 ? sections : undefined };
        log(`Extraction finished: 1 segment`);
        return;
      }

      const topLevel = sections.filter((s) => s.label && /^#{1,2}\s/.test(text.slice(s.offset, s.offset + 4)));
      const splits = topLevel.length >= 2 ? topLevel : sections;
      let yielded = 0;

      for (let i = 0; i < splits.length; i++) {
        const start = splits[i].offset;
        const end = i + 1 < splits.length ? splits[i + 1].offset : text.length;
        const segment = text.slice(start, end);
        if (segment.trim().length === 0) continue;
        const segSections = parseSections(segment);
        yield { text: segment, sections: segSections.length > 0 ? segSections : undefined };
        yielded++;
      }

      if (splits[0].offset > 0) {
        const preamble = text.slice(0, splits[0].offset);
        if (preamble.trim().length > 0) {
          yield { text: preamble };
          yielded++;
        }
      }

      log(`Extraction finished: ${yielded} segments`);
    },
  };
}
