import { z } from "zod/v4";
import { readFileSync, writeFileSync } from "node:fs";
import { defineTool } from "./tool.registry";
import { home, real, requireFile } from "./tool.path";

export const edit = defineTool({
  name: "app_edit",
  description:
    "Edit a file by replacing exact text. The oldText must match exactly (including whitespace and indentation). " +
    "Use this for precise, surgical edits.",
  schema: z.object({
    path: z.string().describe("Absolute or relative file path to edit"),
    oldText: z.string().describe("Exact text to find and replace (must match exactly)"),
    newText: z.string().describe("New text to replace the old text with"),
  }),
  trustScope: "write",
  trustTarget: (input) => real(home(input.path)),
  category: "file",
  summarize: (input) => `Editing ${input.path}`,
  async execute(input, ctx) {
    const filePath = home(input.path);
    ctx.log.info("app_edit", { path: filePath });

    const err = requireFile(filePath, input.path);
    if (err) return err;

    const raw = readFileSync(filePath);
    if (raw.includes(0)) return `Error: binary file — cannot edit "${input.path}"`;

    const content = raw.toString("utf-8");
    const idx = content.indexOf(input.oldText);
    if (idx === -1) return "Error: oldText not found in file. Make sure it matches exactly, including whitespace and indentation.";

    const secondIdx = content.indexOf(input.oldText, idx + input.oldText.length);
    if (secondIdx !== -1) return "Error: oldText matches multiple locations. Use a larger, more unique snippet to identify the exact location.";

    const updated = content.slice(0, idx) + input.newText + content.slice(idx + input.oldText.length);
    writeFileSync(filePath, updated, "utf-8");

    const removedLines = input.oldText.split("\n").length;
    const addedLines = input.newText.split("\n").length;
    return `Edited ${input.path}: replaced ${removedLines} lines with ${addedLines} lines`;
  },
});
