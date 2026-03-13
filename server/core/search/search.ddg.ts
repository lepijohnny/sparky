import * as cheerio from "cheerio";
import { createThrottle } from "./search.throttle";

const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const DDG_LITE_URL = "https://lite.duckduckgo.com/lite/";
const USER_AGENT = "Sparky/1.0 (Desktop App)";
const FETCH_TIMEOUT = 10_000;

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearch {
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

const globalThrottle = createThrottle(5_000, 30_000);

export function createWebSearch(): WebSearch {
  return {
    async search(query: string, maxResults = 10): Promise<SearchResult[]> {
      await globalThrottle.acquire();

      const results = await fetchDdg(DDG_HTML_URL, query, maxResults, parseHtmlResults);
      if (results !== null) return results;

      globalThrottle.backoff();
      return await fetchDdg(DDG_LITE_URL, query, maxResults, parseLiteResults)
        ?? [{ title: "Rate limited", url: "", snippet: "DuckDuckGo rate limit hit. Try again in 30 seconds." }];
    },
  };
}

async function fetchDdg(url: string, query: string, maxResults: number, parse: (html: string, max: number) => SearchResult[]): Promise<SearchResult[] | null> {
  try {
    const body = new URLSearchParams({ q: query });
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
      body: body.toString(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });

    if (res.status === 429 || !res.ok) return null;

    const html = await res.text();
    const results = parse(html, maxResults);
    return results.length > 0 ? results : null;
  } catch {
    return null;
  }
}

function decodeDdgUrl(href: string): string {
  return decodeURIComponent(
    href.replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").replace(/&rut=.*$/, ""),
  );
}

function parseHtmlResults(html: string, max: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];

  $(".result").each((_, el) => {
    if (results.length >= max) return false;

    const $el = $(el);
    const titleEl = $el.find(".result__a");
    const snippetEl = $el.find(".result__snippet");
    const title = titleEl.text().trim();
    const href = titleEl.attr("href") ?? "";
    const snippet = snippetEl.text().trim();

    if (!title || !href) return;

    results.push({ title, url: decodeDdgUrl(href), snippet });
  });

  return results;
}

function parseLiteResults(html: string, max: number): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const rows = $("table:last-of-type tr");

  let current: Partial<SearchResult> = {};

  rows.each((_, el) => {
    if (results.length >= max) return false;

    const $el = $(el);
    const link = $el.find("a.result-link");

    if (link.length > 0) {
      current = {
        title: link.text().trim(),
        url: decodeDdgUrl(link.attr("href") ?? ""),
      };
      return;
    }

    const snippet = $el.find("td.result-snippet");
    if (snippet.length > 0 && current.title) {
      current.snippet = snippet.text().trim();
      results.push({ title: current.title, url: current.url ?? "", snippet: current.snippet });
      current = {};
    }
  });

  return results;
}
