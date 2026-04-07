import { z } from "zod/v4";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { defineTool, basename } from "./tool.registry";
import { home, real, rejectDir } from "./tool.path";

export const write = defineTool({
  name: "app_write",
  description: "Write content to a file. Creates parent dirs. Overwrites if exists. Cannot create empty files.",
  schema: z.object({
    path: z.string().describe("File path"),
    content: z.string().min(1).refine((s) => s.trim().length > 0, "Content must not be empty or whitespace-only").describe("File content (non-empty)"),
  }),
  label: "Writing",
  icon: "file-plus",
  trustScope: "write",
  trustTarget: (input) => real(home(input.path)),
  category: "file",
  friendlyLabel: (input) => `Writing ${basename(input.path)}`,
  summarize: (input) => input.path,
  async execute(input, ctx) {
    const filePath = home(input.path, ctx.cwd);
    ctx.log.info("app_write", { path: filePath });

    const err = rejectDir(filePath, input.path);
    if (err) return err;

    if (!input.content.trim()) return "Error: content must not be empty or whitespace-only. Use app_bash with rm to delete files.";

    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, input.content, "utf-8");

    const lines = input.content.split("\n").length;
    const bytes = Buffer.byteLength(input.content, "utf-8");
    return `Wrote ${lines} lines (${bytes} bytes) to ${input.path}`;
  },
});
