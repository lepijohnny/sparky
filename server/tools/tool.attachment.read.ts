import { z } from "zod/v4";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileTypeFromFile } from "file-type";
import { defineTool } from "./tool.registry";

export const attachmentRead = defineTool({
  name: "app_attachment_read",
  description: "Read a file attached to this conversation. Returns text content for text-based files, or visual data for images and binary files.",
  schema: z.object({
    path: z.string().describe("The full file path of the attachment to read"),
  }),
  async execute(input) {
    const filePath = resolve(input.path);

    try {
      const detected = await fileTypeFromFile(filePath);

      if (!detected) {
        return readFileSync(filePath, "utf-8");
      }

      const filename = filePath.split("/").pop() ?? "file";
      const data = readFileSync(filePath).toString("base64");
      return {
        text: `Attachment: ${filename} (${detected.mime})`,
        binary: [{ data, mimeType: detected.mime, filename }],
      };
    } catch {
      return `Error: Attachment not found at "${input.path}"`;
    }
  },
});
