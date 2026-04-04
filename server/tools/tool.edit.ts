import { z } from "zod/v4";
import { readFileSync, writeFileSync } from "node:fs";
import { defineTool, basename } from "./tool.registry";
import { home, real, requireFile } from "./tool.path";

const editPair = z.object({
  oldText: z.string().describe("Exact text to find (must match exactly, including whitespace). Always app_read the file first and copy from output."),
  newText: z.string().describe("Replacement text"),
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
    "Edit a file by replacing exact text. Always app_read the file first so oldText matches exactly. " +
    "Provide one or more edits. Keep oldText short (1-3 lines) for reliability. " +
    "If an edit fails, re-read the file before retrying.",
  schema: z.object({
    path: z.string().describe("Absolute or relative file path to edit"),
    edits: z.array(editPair).describe("List of edits to apply. Each edit has oldText (exact match) and newText (replacement). Applied in order."),
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

    const pairs = input.edits;
    if (!pairs || pairs.length === 0) return "Error: provide at least one edit in the edits array.";

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
