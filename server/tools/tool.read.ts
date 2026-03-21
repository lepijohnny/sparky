import { z } from "zod/v4";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileTypeFromFile } from "file-type";
import { defineTool } from "./tool.registry";
import { promptsDir } from "../prompts/prompt.role";
import { home, real, requireFile } from "./tool.path";

function resolvePath(path: string): string {
  const prompts = join(promptsDir(), path);
  if (statSync(prompts, { throwIfNoEntry: false })?.isFile()) return prompts;
  return home(path);
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_LINES = 2000;
const MAX_BYTES = 50 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function truncateHead(lines: string[], maxLines: number, maxBytes: number): { content: string; outputLines: number; truncatedBy: "lines" | "bytes" | null } {
  const collected: string[] = [];
  let byteCount = 0;

  for (let i = 0; i < lines.length && i < maxLines; i++) {
    const lineBytes = Buffer.byteLength(lines[i], "utf-8") + (i > 0 ? 1 : 0);
    if (byteCount + lineBytes > maxBytes) {
      return { content: collected.join("\n"), outputLines: collected.length, truncatedBy: "bytes" };
    }
    collected.push(lines[i]);
    byteCount += lineBytes;
  }

  if (collected.length >= maxLines && collected.length < lines.length) {
    return { content: collected.join("\n"), outputLines: collected.length, truncatedBy: "lines" };
  }

  return { content: collected.join("\n"), outputLines: collected.length, truncatedBy: null };
}

export const read = defineTool({
  name: "app_read",
  description:
    "Read the contents of a file. Supports text files and images (jpg, png, gif, webp). " +
    "Images are returned as visual attachments. " +
    `For text files, output is truncated to ${MAX_LINES} lines or ${formatSize(MAX_BYTES)} (whichever is hit first). ` +
    "Use offset/limit for large files. When you need the full file, continue with offset until complete.",
  schema: z.object({
    path: z.string().describe("Absolute or relative file path to read"),
    offset: z.number().optional().describe("Line number to start reading from (1-indexed)"),
    limit: z.number().optional().describe("Maximum number of lines to read"),
  }),
  trustScope: "read",
  trustTarget: (input) => real(resolvePath(input.path)),
  category: "file",
  summarize: (input) => `Reading ${input.path}`,
  async execute(input, ctx) {
    if (/^https?:\/\//i.test(input.path)) {
      return "Error: app_read is for local files only. Use app_web_read to fetch URLs.";
    }
    const filePath = resolvePath(input.path);
    ctx.log.info("app_read", { path: filePath, offset: input.offset, limit: input.limit });

    const err = requireFile(filePath, input.path);
    if (err) return err;
    const stat = statSync(filePath);
    if (stat.size > MAX_FILE_SIZE) return `Error: file exceeds 10 MB limit (${formatSize(stat.size)})`;

    const detected = await fileTypeFromFile(filePath);
    if (detected) {
      if (detected.mime.startsWith("image/")) {
        const filename = filePath.split("/").pop() ?? "file";
        const data = readFileSync(filePath).toString("base64");
        return {
          text: `Image: ${filename} (${detected.mime})`,
          binary: [{ data, mimeType: detected.mime, filename }],
        };
      }
      return `Error: binary file (${detected.mime}) not supported.`;
    }

    const content = readFileSync(filePath, "utf-8");
    const allLines = content.split("\n");
    const total = allLines.length;

    const start = Math.max(0, (input.offset ?? 1) - 1);
    if (start >= total) return `Error: offset ${input.offset} is beyond end of file (${total} lines total)`;

    const userLimit = input.limit;
    const sliced = userLimit !== undefined
      ? allLines.slice(start, start + userLimit)
      : allLines.slice(start);

    const { content: text, outputLines, truncatedBy } = truncateHead(sliced, MAX_LINES, MAX_BYTES);

    if (outputLines === 0 && sliced.length > 0) {
      const lineSize = formatSize(Buffer.byteLength(sliced[0], "utf-8"));
      return `[Line ${start + 1} is ${lineSize}, exceeds ${formatSize(MAX_BYTES)} limit. Use bash: sed -n '${start + 1}p' ${input.path} | head -c ${MAX_BYTES}]`;
    }

    const endLine = start + outputLines;
    const remaining = total - endLine;

    if (truncatedBy) {
      const note = truncatedBy === "bytes" ? ` (${formatSize(MAX_BYTES)} limit)` : "";
      return `${text}\n\n[Showing lines ${start + 1}-${endLine} of ${total}${note}. Use offset=${endLine + 1} to continue.]`;
    }

    if (userLimit !== undefined && remaining > 0) {
      return `${text}\n\n[${remaining} more lines in file. Use offset=${endLine + 1} to continue.]`;
    }

    return text;
  },
});
