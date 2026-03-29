import { readFileSync } from "fs";
import { resolve } from "path";
import type { EventBus } from "../bus";
import type { Logger } from "../../logger.types";
import { createWebSearch, type WebSearch } from "./search.ddg";
import { createWebReader, type WebReader } from "./search.read";
import { createAgentSearchProvider, type SearchAgentFn, type SearchProvider } from "./search.provider";

declare const SPARKY_VERSION: string | undefined;

const version = typeof SPARKY_VERSION !== "undefined" ? SPARKY_VERSION : (() => {
  try { return readFileSync(resolve(import.meta.dirname, "../../../.version"), "utf-8").trim(); } catch { return "0.0.0"; }
})();
const headers: HeadersInit = { "User-Agent": `Sparky/${version} (Desktop App)` };

export interface SearchService {
  search: WebSearch;
  reader: WebReader;
}

export function createSearchService(bus: EventBus, log: Logger, searchAgentFn?: SearchAgentFn): SearchService {
  const ddgSearch = createWebSearch(headers);
  const reader = createWebReader(headers);
  const provider: SearchProvider | null = searchAgentFn
    ? createAgentSearchProvider(searchAgentFn, log)
    : null;

  bus.on("web.search", async (data) => {
    log.info("Web search", { query: data.query, max: data.maxResults });

    if (provider) {
      try {
        const results = await provider.search(data.query, data.maxResults ?? 10);
        if (results.length > 0) {
          log.info("Web search via", { provider: provider.name, results: results.length });
          return { results };
        }
        log.warn("Provider returned 0 results, falling back to DDG");
      } catch (err) {
        log.warn("Provider search failed, falling back to DDG", { error: String(err) });
      }
    }

    const results = await ddgSearch.search(data.query, data.maxResults);
    return { results };
  });

  bus.on("web.read", async (data) => {
    log.info("Web read", { url: data.url });
    const content = await reader.read(data.url);
    return { content };
  });

  return { search: ddgSearch, reader };
}
