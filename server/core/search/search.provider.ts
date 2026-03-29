/**
 * Multi-provider web search with automatic fallback.
 *
 * Resolution order:
 *   1. Anthropic (Haiku + native web_search) — cheapest, best quality
 *   2. OpenAI (gpt-4o-mini + native web_search) — if no Anthropic
 *   3. DuckDuckGo — universal fallback, no credentials needed
 *
 * Uses the same adapter/agent system as chat — auth, OAuth refresh,
 * and provider quirks are all handled by pi-ai.
 */

import type { SearchResult } from "./search.ddg";
import type { Agent } from "../agent.types";
import type { Logger } from "../../logger.types";

const SEARCH_SYSTEM_PROMPT = `You are a web search assistant. When the user gives you a search query, use your web search tool to find relevant results. After searching, respond with a numbered list in this exact format:

1. Title of result
   URL
   2-3 sentence summary of what this page contains and why it's relevant.

2. Title of result
   URL
   2-3 sentence summary of what this page contains and why it's relevant.

Include a brief summary for each result based on what you found. No markdown links, no extra commentary outside the list.`;

export type SearchAgentFn = () => Promise<{ agent: Agent; provider: string; model: string } | null>;

export interface SearchProvider {
  readonly name: string;
  search(query: string, maxResults: number): Promise<SearchResult[]>;
}

export function createAgentSearchProvider(agentFn: SearchAgentFn, log: Logger): SearchProvider {
  return {
    name: "LLM",
    async search(query: string, maxResults: number): Promise<SearchResult[]> {
      const result = await agentFn();
      if (!result) throw new Error("No search agent available");
      log.info("Search agent", { provider: result.provider, model: result.model });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);

      try {
        let text = "";

        for await (const event of result.agent.stream({
          system: SEARCH_SYSTEM_PROMPT,
          messages: [{ role: "user", content: `Search for: ${query}` }],
          cancellation: controller.signal,
        })) {
          if (event.type === "text.done") text = event.content;
          if (event.type === "error") throw new Error(event.message);
        }

        return parseNumberedResults(text, maxResults);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function parseNumberedResults(text: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length && results.length < maxResults; i++) {
    const titleMatch = lines[i].match(/^\d+\.\s+(.+)/);
    if (!titleMatch) continue;

    const title = titleMatch[1].replace(/\*\*/g, "").trim();
    const nextLine = lines[i + 1]?.trim() ?? "";
    const urlMatch = nextLine.match(/^(https?:\/\/\S+)/);

    if (urlMatch) {
      i++;
      const snippetLines: string[] = [];
      while (i + 1 < lines.length && !lines[i + 1].match(/^\d+\.\s+/)) {
        i++;
        snippetLines.push(lines[i]);
      }
      results.push({ title, url: urlMatch[1], snippet: snippetLines.join(" ") });
    }
  }

  /** Fallback: try markdown links if numbered format didn't work */
  if (results.length === 0) {
    const linkRe = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(text)) !== null && results.length < maxResults) {
      results.push({ title: m[1], url: m[2], snippet: "" });
    }
  }

  /** Last resort: bare URLs */
  if (results.length === 0) {
    const urlRe = /https?:\/\/[^\s)]+/g;
    let m: RegExpExecArray | null;
    while ((m = urlRe.exec(text)) !== null && results.length < maxResults) {
      results.push({ title: m[0], url: m[0], snippet: "" });
    }
  }

  return results;
}


