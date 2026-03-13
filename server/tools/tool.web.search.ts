import { z } from "zod/v4";
import { defineTool } from "./tool.registry";

export const webSearch = defineTool({
  name: "app_web_search",
  description: "Search the web using DuckDuckGo. Returns titles, URLs, and snippets. Use this to find documentation, APIs, or any information not available in app_docs_read.",
  schema: z.object({
    query: z.string().describe("Search query, e.g. 'todoist REST API v1 documentation'"),
    maxResults: z.number().optional().default(10).describe("Max results to return (default 10)"),
  }),
  summarize: (input) => `Searching: ${input.query}`,
  async execute(input, ctx) {
    ctx.log.info("app_web_search", { query: input.query });
    const { results } = await ctx.bus.emit("web.search", { query: input.query, maxResults: input.maxResults });
    if (results.length === 0) return "No results found.";
    return results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
  },
});
