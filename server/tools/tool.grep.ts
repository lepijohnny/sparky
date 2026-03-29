import { z } from "zod/v4";
import { execFile } from "node:child_process";
import { defineTool, trunc } from "./tool.registry";
import { home, requirePath } from "./tool.path";

const MAX_MATCHES = 100;
const MAX_LINE_LENGTH = 500;

function truncateLine(line: string): string {
  if (line.length <= MAX_LINE_LENGTH) return line;
  return `${line.slice(0, MAX_LINE_LENGTH)}... [truncated]`;
}

function runGrep(args: string[], signal?: AbortSignal): Promise<{ raw: string; noMatch: boolean; error?: string }> {
  return new Promise((resolve) => {
    const child = execFile("grep", args, {
      encoding: "utf-8",
      timeout: 15_000,
      maxBuffer: 10 * 1024 * 1024,
    }, (err, stdout) => {
      if (signal) signal.removeEventListener("abort", onAbort);
      if (err) {
        if ((err as any).status === 1 || !stdout?.trim()) return resolve({ raw: "", noMatch: true });
        return resolve({ raw: "", noMatch: false, error: `Error: grep failed — ${err.message}` });
      }
      resolve({ raw: typeof stdout === "string" ? stdout : "", noMatch: false });
    });

    const onAbort = () => child.kill("SIGTERM");
    if (signal) {
      if (signal.aborted) { child.kill("SIGTERM"); return; }
      signal.addEventListener("abort", onAbort);
    }
  });
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
  label: "Matching",
  icon: "search",
  category: "file",
  friendlyLabel: (input) => `Searching code: ${trunc(input.pattern, 40)}`,
  summarize: (input) => input.pattern,
  async execute(input, ctx) {
    const searchPath = input.path ? home(input.path, ctx.cwd) : (ctx.cwd ?? process.cwd());
    ctx.log.info("app_grep", { pattern: input.pattern, path: searchPath });

    const err = requirePath(searchPath, input.path ?? searchPath);
    if (err) return err;

    const args = ["-rn"];
    if (input.ignoreCase) args.push("-i");
    args.push("-m", String(MAX_MATCHES), "--", input.pattern, searchPath);

    const result = await runGrep(args, ctx.signal);
    if (ctx.signal.aborted) return "Error: cancelled";
    if (result.noMatch) return "No matches found.";
    if (result.error) return result.error;

    if (!result.raw.trim()) return "No matches found.";

    const lines = result.raw.trimEnd().split("\n");

    const stripCwd = ctx.cwd ?? process.cwd();
    const output = lines
      .map((line) => truncateLine(line.startsWith(stripCwd) ? line.slice(stripCwd.length + 1) : line))
      .join("\n");

    return output;
  },
});
