import { z } from "zod/v4";
import { readFileSync, writeFileSync } from "node:fs";
import { defineTool, basename } from "./tool.registry";
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
  label: "Editing",
  icon: "pencil",
  trustScope: "write",
  trustTarget: (input) => real(home(input.path)),
  category: "file",
  friendlyLabel: (input) => `Editing ${basename(input.path)}`,
  summarize: (input) => input.path,
  async execute(input, ctx) {
    const filePath = home(input.path, ctx.cwd);
    ctx.log.info("app_edit", { path: filePath });

    const err = requireFile(filePath, input.path);
    if (err) return err;

    const raw = readFileSync(filePath);
    if (raw.includes(0)) return `Error: binary file — cannot edit "${input.path}"`;

    const content = raw.toString("utf-8");
    const idx = content.indexOf(input.oldText);
    if (idx === -1) {
      const lines = content.split("\n");
      const firstLine = input.oldText.split("\n")[0].trim();
      let bestLine = -1;
      let bestScore = 0;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(firstLine)) { bestLine = i; bestScore = 1; break; }
        const overlap = firstLine.split(" ").filter((w) => w.length > 2 && lines[i].includes(w)).length;
        if (overlap > bestScore) { bestScore = overlap; bestLine = i; }
      }
      const hint = bestLine >= 0
        ? `\nClosest match near line ${bestLine + 1}:\n${lines.slice(Math.max(0, bestLine - 2), bestLine + 3).map((l, i) => `  ${Math.max(1, bestLine - 1) + i}: ${l}`).join("\n")}\n\nRe-read the file with app_read to get the exact text before retrying.`
        : "\nRe-read the file with app_read to get the exact current content before retrying.";
      return `Error: oldText not found in file. Make sure it matches exactly, including whitespace and indentation.${hint}`;
    }

    const secondIdx = content.indexOf(input.oldText, idx + input.oldText.length);
    if (secondIdx !== -1) return "Error: oldText matches multiple locations. Use a larger, more unique snippet to identify the exact location.";

    const updated = content.slice(0, idx) + input.newText + content.slice(idx + input.oldText.length);
    writeFileSync(filePath, updated, "utf-8");

    const removedLines = input.oldText.split("\n").length;
    const addedLines = input.newText.split("\n").length;
    return `Edited ${input.path}: replaced ${removedLines} lines with ${addedLines} lines`;
  },
});
