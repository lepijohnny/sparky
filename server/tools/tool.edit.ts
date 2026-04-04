import { z } from "zod/v4";
import { readFileSync, writeFileSync } from "node:fs";
import { defineTool, basename } from "./tool.registry";
import { home, real, requireFile } from "./tool.path";

const editPair = z.object({
  oldText: z.string().describe("Exact text to find and replace (must match exactly)"),
  newText: z.string().describe("New text to replace the old text with"),
});

function findClosestHint(content: string, oldText: string): string {
  const lines = content.split("\n");
  const firstLine = oldText.split("\n")[0].trim();
  let bestLine = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(firstLine)) { bestLine = i; bestScore = 1; break; }
    const overlap = firstLine.split(" ").filter((w) => w.length > 2 && lines[i].includes(w)).length;
    if (overlap > bestScore) { bestScore = overlap; bestLine = i; }
  }
  if (bestLine >= 0) {
    const context = lines.slice(Math.max(0, bestLine - 2), bestLine + 3)
      .map((l, i) => `  ${Math.max(1, bestLine - 1) + i}: ${l}`).join("\n");
    return `\nClosest match near line ${bestLine + 1}:\n${context}\n\nRe-read the file with app_read to get the exact text before retrying.`;
  }
  return "\nRe-read the file with app_read to get the exact current content before retrying.";
}

function applyEdit(content: string, oldText: string, newText: string, index: number): { result: string; error?: undefined } | { error: string; result?: undefined } {
  const idx = content.indexOf(oldText);
  if (idx === -1) {
    const hint = findClosestHint(content, oldText);
    return { error: `Edit ${index + 1}: oldText not found in file. Make sure it matches exactly, including whitespace and indentation.${hint}` };
  }
  const secondIdx = content.indexOf(oldText, idx + oldText.length);
  if (secondIdx !== -1) return { error: `Edit ${index + 1}: oldText matches multiple locations. Use a larger, more unique snippet to identify the exact location.` };
  return { result: content.slice(0, idx) + newText + content.slice(idx + oldText.length) };
}

export const edit = defineTool({
  name: "app_edit",
  description:
    "Edit a file by replacing exact text. The oldText must match EXACTLY (including whitespace and indentation) — " +
    "always app_read the file first and copy oldText from the output. " +
    "Supports single edit (oldText + newText) or multiple edits (edits array). " +
    "Keep oldText short (1-3 lines) for reliability. If edit fails, re-read the file before retrying.",
  schema: z.object({
    path: z.string().describe("Absolute or relative file path to edit"),
    oldText: z.string().optional().describe("Exact text to find and replace (single edit mode)"),
    newText: z.string().optional().describe("New text to replace the old text with (single edit mode)"),
    edits: z.array(editPair).optional().describe("Array of {oldText, newText} pairs for multiple edits in one call"),
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

    const pairs: { oldText: string; newText: string }[] = input.edits
      ?? (input.oldText !== undefined ? [{ oldText: input.oldText, newText: input.newText ?? "" }] : []);

    if (pairs.length === 0) return "Error: provide either oldText+newText or an edits array.";

    let content = raw.toString("utf-8");
    const results: string[] = [];

    for (let i = 0; i < pairs.length; i++) {
      const { oldText, newText } = pairs[i];
      const applied = applyEdit(content, oldText, newText, i);
      if (applied.error) return applied.error;
      const removedLines = oldText.split("\n").length;
      const addedLines = newText.split("\n").length;
      results.push(`edit ${i + 1}: replaced ${removedLines} lines with ${addedLines} lines`);
      content = applied.result;
    }

    writeFileSync(filePath, content, "utf-8");
    return `Edited ${input.path}: ${results.join(", ")}`;
  },
});
