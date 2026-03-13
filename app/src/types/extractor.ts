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

export interface InstalledExtractor {
  name: string;
  version: string;
  description?: string;
  extensions: string[];
  options: ExtractorOption[];
  builtIn: boolean;
}
