import { z } from "zod/v4";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { defineTool } from "./tool.registry";
import { promptsDir } from "../prompts/prompt.role";

const FORMATS_DIR = join(promptsDir(), "formats");

let cachedIndex: string[] | null = null;

async function listFormats(): Promise<string[]> {
  if (cachedIndex) return cachedIndex;
  try {
    const files = await readdir(FORMATS_DIR);
    cachedIndex = files.filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
  } catch {
    cachedIndex = [];
  }
  return cachedIndex;
}

export const formatRead = defineTool({
  name: "app_format_read",
  description:
    "Read documentation for a visualization format supported by the app. " +
    "Call this before using any special rendering format (mermaid, latex, etc.) to get the correct syntax and examples. " +
    "Call with no arguments to list available formats.",
  schema: z.object({
    name: z.string().optional().describe("Format name, e.g. 'mermaid', 'latex'. Omit to list all available formats."),
  }),
  category: "docs",
  summarize: (input) => input.name ? `Reading ${input.name} format` : "Listing formats",
  async execute(input) {
    if (!input.name) {
      const formats = await listFormats();
      return formats.length > 0
        ? `Available formats:\n${formats.map((f) => `- ${f}`).join("\n")}`
        : "No formats available.";
    }

    const safe = input.name.replace(/[^a-zA-Z0-9_-]/g, "");
    try {
      return await readFile(join(FORMATS_DIR, `${safe}.md`), "utf-8");
    } catch {
      const formats = await listFormats();
      return `Format "${input.name}" not found. Available: ${formats.join(", ")}`;
    }
  },
});
