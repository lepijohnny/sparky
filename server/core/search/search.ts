import { readFileSync } from "fs";
import { resolve } from "path";
import type { EventBus } from "../bus";
import type { Logger } from "../../logger.types";
import { createWebSearch, type WebSearch } from "./search.ddg";
import { createWebReader, type WebReader } from "./search.read";

let version = "0.0.0";
try { version = readFileSync(resolve(import.meta.dirname, "../../../.version"), "utf-8").trim(); } catch { /* bundled app — .version not available */ }
const headers: HeadersInit = { "User-Agent": `Sparky/${version} (Desktop App)` };

export interface SearchService {
  search: WebSearch;
  reader: WebReader;
}

export function createSearchService(bus: EventBus, log: Logger): SearchService {
  const search = createWebSearch(headers);
  const reader = createWebReader(headers);

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
