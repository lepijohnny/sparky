import { z } from "zod/v4";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { defineTool } from "./tool.registry";
import { home } from "./tool.path";

const MAX_MATCHES = 100;
const MAX_LINE_LENGTH = 500;

function truncateLine(line: string): string {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return `${line.slice(0, MAX_LINE_LENGTH)}... [truncated]`;
}

export const grep = defineTool({
  name: "app_grep",
  description:
    "Search file contents for a pattern using regex. Returns matching lines with file paths and line numbers. " +
    `Output is truncated to ${MAX_MATCHES} matches. Long lines are truncated to ${MAX_LINE_LENGTH} chars.`,
  schema: z.object({
    pattern: z.string().describe("Search pattern (regex)"),
    path: z.string().optional().describe("File or directory to search (default: current working directory)"),
    ignoreCase: z.boolean().optional().describe("Case-insensitive search (default: false)"),
  }),
  category: "file",
  summarize: (input) => `Grep ${input.pattern}`,
  async execute(input, ctx) {
    const searchPath = input.path ? home(input.path) : process.cwd();
    ctx.log.info("app_grep", { pattern: input.pattern, path: searchPath });

    const stat = statSync(searchPath, { throwIfNoEntry: false });
    if (!stat) return `Error: path not found "${input.path ?? searchPath}"`;

    const args = ["-rn"];
    if (input.ignoreCase) args.push("-i");
    args.push("-m", String(MAX_MATCHES), "--", input.pattern, searchPath);

    let raw: string;
    try {
      raw = execFileSync("grep", args, { encoding: "utf-8", timeout: 15_000, maxBuffer: 10 * 1024 * 1024 });
    } catch (err: any) {
      if (err.status === 1 || !err.stdout?.trim()) return "No matches found.";
      return `Error: grep failed — ${err.message}`;
    }

    if (!raw.trim()) return "No matches found.";

    const lines = raw.trimEnd().split("\n");

    const cwd = process.cwd();
    const output = lines
      .map((line) => truncateLine(line.startsWith(cwd) ? line.slice(cwd.length + 1) : line))
      .join("\n");

    return output;
  },
});
