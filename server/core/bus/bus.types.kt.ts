import type { Source, SourceFile, SearchResult } from "../../knowledge/kt.types";
import type { InstalledExtractor, ExtractorOptionValues } from "../../knowledge/kt.extractor.types";

export interface KtEvents {
  "kt.sources.list":       { req: void; res: { sources: Source[] } };
  "kt.sources.count":      { req: void; res: { count: number } };
  "kt.sources.add.file":   { req: { path: string }; res: { source: Source } };
  "kt.sources.add.folder": { req: { path: string }; res: { source: Source } };
  "kt.sources.add.url":    { req: { url: string }; res: { source: Source } };
  "kt.sources.delete":     { req: { id: string }; res: { deleted: boolean } };
  "kt.sources.get":        { req: { id: string }; res: { source: Source; files: SourceFile[] } | null };
  "kt.sources.reindex":    { req: { id: string; force?: boolean }; res: { source: Source } };
  "kt.sources.cancel":     { req: { id: string }; res: { ok: boolean } };
  "kt.sources.extensions": { req: void; res: { extensions: string[] } };
  "kt.source.created":     { req: { source: Source }; res: void };
  "kt.source.updated":     { req: { source: Source; files?: SourceFile[] }; res: void };
  "kt.search":             { req: { query: string; limit?: number; minScore?: number }; res: { results: SearchResult[] } };
  "kt.source.deleted":     { req: { id: string }; res: void };

  "extractors.list":           { req: void; res: { extractors: InstalledExtractor[] } };
  "extractors.options.get":    { req: { name: string }; res: { options: ExtractorOptionValues } };
  "extractors.options.set":    { req: { name: string; options: ExtractorOptionValues }; res: { ok: boolean } };
}
