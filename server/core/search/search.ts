import type { EventBus } from "../bus";
import type { Logger } from "../../logger.types";
import { createWebSearch, type WebSearch } from "./search.ddg";
import { createWebReader, type WebReader } from "./search.read";

export interface SearchService {
  search: WebSearch;
  reader: WebReader;
}

export function createSearchService(bus: EventBus, log: Logger): SearchService {
  const search = createWebSearch();
  const reader = createWebReader();

  bus.on("web.search", async (data) => {
    log.info("Web search", { query: data.query, max: data.maxResults });
    const results = await search.search(data.query, data.maxResults);
    return { results };
  });

  bus.on("web.read", async (data) => {
    log.info("Web read", { url: data.url });
    const content = await reader.read(data.url);
    return { content };
  });

  return { search, reader };
}
