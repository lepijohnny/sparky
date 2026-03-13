import type { FileExtractor } from "./kt.types";

/**
 * Registry of file extractors. New formats are added by calling register().
 * The registry drives folder scanning, file picker filters, and extraction.
 */
export class ExtractorRegistry {
  private extractors = new Map<string, FileExtractor>();

  register(extractor: FileExtractor): void {
    for (const ext of extractor.extensions) {
      this.extractors.set(ext.toLowerCase(), extractor);
    }
  }

  get(ext: string): FileExtractor | null {
    return this.extractors.get(ext.toLowerCase()) ?? null;
  }

  /** All currently supported file extensions */
  supportedExtensions(): string[] {
    return [...this.extractors.keys()];
  }
}
