import { z } from "zod/v4";
import { defineTool, trunc } from "./tool.registry";

export const webSearch = defineTool({
  name: "app_web_search",
  label: "Web Searching",
  icon: "globe",
  description: "Search the web using DuckDuckGo. Returns titles, URLs, and snippets. Use this to find documentation, APIs, or any information not available in app_read.",
  schema: z.object({
    query: z.string().describe("Search query, e.g. 'todoist REST API v1 documentation'"),
    maxResults: z.number().optional().default(10).describe("Max results to return (default 10)"),
  }),
  friendlyLabel: (input) => `Searched "${trunc(input.query)}"`,
  summarize: (input) => input.query,
  async execute(input, ctx) {
    ctx.log.info("app_web_search", { query: input.query });
    const { results } = await ctx.bus.emit("web.search", { query: input.query, maxResults: input.maxResults });
    if (results.length === 0) return "No results found.";
    const list = results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
    return `Web search results for query: "${input.query}"\n\n${list}\n\nREMINDER: You MUST include the sources above in your response to the user using markdown hyperlinks.`;
  },
});
