import type { SearchResult } from "../search/search.ddg";

export interface SearchEvents {
  "web.search": { req: { query: string; maxResults?: number }; res: { results: SearchResult[] } };
  "web.read":   { req: { url: string }; res: { content: string } };
}
