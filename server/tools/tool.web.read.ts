import { z } from "zod/v4";
import { defineTool } from "./tool.registry";

export const webRead = defineTool({
  name: "app_web_read",
  label: "Fetching",
  icon: "globe",
  description: "Fetch and extract readable text from a URL. Use after app_web_search to read a specific page. Returns cleaned text content (max ~8K chars).",
  schema: z.object({
    url: z.url().describe("URL to fetch and read, e.g. https://developer.todoist.com/api/v1/"),
  }),
  recovery: 'Use app_web_search first to find the correct URL.',
  summarize: (input) => {
    try { return `${new URL(input.url).hostname}${new URL(input.url).pathname}`; } catch { return input.url; }
  },
  async execute(input, ctx) {
    ctx.log.info("app_web_read", { url: input.url });
    const { content } = await ctx.bus.emit("web.read", { url: input.url });
    return content || "Could not extract text from this page.";
  },
});
