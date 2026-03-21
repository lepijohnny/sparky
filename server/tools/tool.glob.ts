import { z } from "zod/v4";
import { glob as globFn } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { defineTool } from "./tool.registry";
import { home, requireDir } from "./tool.path";

const MAX_ENTRIES = 500;

export const glob = defineTool({
  name: "app_glob",
  description:
    "List files matching a glob pattern. Returns paths sorted alphabetically, directories suffixed with '/'. " +
    `Output is truncated to ${MAX_ENTRIES} entries.`,
  schema: z.object({
    pattern: z.string().describe("Glob pattern, e.g. '**/*.ts', 'src/**/*.test.ts'"),
    cwd: z.string().optional().describe("Directory to search from (default: current working directory)"),
  }),
  category: "file",
  summarize: (input) => `Glob ${input.pattern}`,
  async execute(input, ctx) {
    const cwd = input.cwd ? home(input.cwd) : process.cwd();
    ctx.log.info("app_glob", { pattern: input.pattern, cwd });

    const err = requireDir(cwd, input.cwd ?? cwd);
    if (err) return err;

    const entries: string[] = [];
    for await (const entry of globFn(input.pattern, { cwd })) {
      if (ctx.signal.aborted) return "Error: cancelled";
      entries.push(entry);
    }
    entries.sort((a, b) => a.localeCompare(b));

    const results: string[] = [];

    for (const entry of entries) {
      if (results.length >= MAX_ENTRIES) break;
      if (ctx.signal.aborted) return "Error: cancelled";

      const full = resolve(cwd, entry);
      try {
        const entryStat = await stat(full);
        results.push(entryStat.isDirectory() ? `${entry}/` : entry);
      } catch {
        continue;
      }
    }

    if (results.length === 0) return "No matches found.";

    const output = results.join("\n");
    const remaining = entries.length - results.length;
    if (remaining > 0) {
      return `${output}\n\n[${remaining} more entries. Refine the pattern to narrow results.]`;
    }

    return output;
  },
});
