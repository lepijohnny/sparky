import { z } from "zod/v4";
import { defineTool } from "./tool.registry";
import { readPromptFile } from "../prompts/prompt.role";

export const docsRead = defineTool({
  name: "app_docs_read",
  description: "Read a documentation file. Use this to look up API reference and examples before acting.",
  schema: z.object({
    path: z.string().describe("File path, e.g. 'api.md' or 'examples/labels/create.md'"),
  }),
  category: "docs",
  summarize: (input) => `Reading ${input.path}`,
  async execute(input, ctx) {
    ctx.log.info("app_docs_read", { path: input.path });
    return readPromptFile(input.path.replace(/\.\./g, ""));
  },
});
