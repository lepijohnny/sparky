import * as cheerio from "cheerio";
import { createThrottle } from "./search.throttle";
const FETCH_TIMEOUT = 15_000;
const MAX_CHARS = 8_000;

export interface WebReader {
  read(url: string): Promise<string>;
}

export function createWebReader(headers: HeadersInit): WebReader {
  const throttle = createThrottle(2_000, 10_000);

  return {
    async read(url: string): Promise<string> {
      await throttle.acquire();

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
        redirect: "follow",
      });

      if (!res.ok) return `Failed to fetch: HTTP ${res.status}`;

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("text/html")) {
        const text = await res.text();
        return text.slice(0, MAX_CHARS);
      }

      const html = await res.text();
      return extractText(html);
    },
  };
}

function extractText(html: string): string {
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header, aside, iframe, noscript, svg, [role='navigation'], [role='banner'], .nav, .footer, .header, .sidebar, .menu, .ad, .ads, .advertisement").remove();

  const article = $("article, main, [role='main'], .content, .post, .article, #content, #main");
  const root = article.length > 0 ? article.first() : $("body");

  const text = root
    .find("p, h1, h2, h3, h4, h5, h6, li, td, th, pre, code, blockquote, dd, dt")
    .map((_, el) => {
      const tag = (el as any).tagName as string;
      const content = $(el).text().trim();
      if (!content) return null;
      if (tag.startsWith("h")) return `\n## ${content}\n`;
      if (tag === "li") return `- ${content}`;
      if (tag === "pre" || tag === "code") return `\`\`\`\n${content}\n\`\`\``;
      return content;
    })
    .get()
    .filter(Boolean)
    .join("\n");

  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned.slice(0, MAX_CHARS);
}
