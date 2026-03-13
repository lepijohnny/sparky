/**
 * Extractor option schema — declared in package.json under sparky.options.
 * Flat object so third-party extractors just write plain JSON.
 */
export interface ExtractorOption {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "select";
  default: string | number | boolean;
  description?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  choices?: { value: string; label: string }[];
}

export type ExtractorOptionValues = Record<string, unknown>;

export interface InstalledExtractor {
  name: string;
  version: string;
  description?: string;
  extensions: string[];
  options: ExtractorOption[];
  builtIn: boolean;
}
