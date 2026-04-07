import { z } from "zod/v4";
import { defineTool } from "./tool.registry";

export const webRead = defineTool({
  name: "app_web_read",
  label: "Fetching",
  icon: "globe",
  description: "Fetch readable text from a URL (~8K chars max).",
  schema: z.object({
    url: z.url().describe("URL to read"),
  }),
  recovery: 'Use app_web_search first to find the correct URL.',
  friendlyLabel: (input) => {
    try { return `Fetching ${new URL(input.url).hostname}`; } catch { return "Fetching page"; }
  },
  summarize: (input) => {
    try { return `${new URL(input.url).hostname}${new URL(input.url).pathname}`; } catch { return input.url; }
  },
  async execute(input, ctx) {
    ctx.log.info("app_web_read", { url: input.url });
    const { content } = await ctx.bus.emit("web.read", { url: input.url });
    return content || "Could not extract text from this page.";
  },
});
