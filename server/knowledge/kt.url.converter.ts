/**
 * Built-in URL extractor for the knowledge base.
 *
 * Extracts clean, structured markdown from web pages using
 * Mozilla Readability for content detection and linkedom for DOM parsing.
 *
 * Strategy (in order):
 * 1. Try /llms-full.txt, /llms.txt — AI-friendly content standard
 * 2. Parse robots.txt — respect Disallow rules and Crawl-delay
 * 3. Parse sitemap.xml (from robots.txt or default) — seed BFS queue
 * 4. BFS crawl same-origin links (depth 3, max 200 pages)
 */
import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import type { ExtractionResult, FileMdConverter } from "./kt.types";

const MAX_DEPTH = 3;
const MAX_PAGES = 200;
const TIMEOUT_MS = 10_000;
const DEFAULT_CRAWL_DELAY = 0;

const SKIP_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
  ".pdf", ".zip", ".tar", ".gz", ".mp4", ".mp3", ".wav",
  ".css", ".js", ".woff", ".woff2", ".ttf", ".eot",
]);

const REMOVE_TAGS = new Set([
  "script", "style", "noscript", "svg", "iframe", "canvas",
  "nav", "footer", "header", "aside", "form", "button",
  "input", "select", "textarea",
]);

const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

const BLOCK_TAGS = new Set([
  "p", "div", "section", "article", "main", "blockquote",
  "li", "td", "th", "dt", "dd", "figcaption", "pre",
  ...HEADING_TAGS,
]);

export function shouldSkipExt(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return SKIP_EXTENSIONS.has(path.slice(path.lastIndexOf(".")));
  } catch {
    return true;
  }
}

export function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    u.hash = "";
    u.search = "";
    return u.href;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((r) => setTimeout(r, ms));
}

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchText(url: string, timeoutMs?: number): Promise<string | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs || TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return res.text();
}

export function parseRobotsTxt(text: string, origin: string) {
  const disallow: string[] = [];
  const sitemaps: string[] = [];
  let crawlDelay = DEFAULT_CRAWL_DELAY;
  let inBlock = false;

  for (const raw of text.split("\n")) {
    const line = raw.trim().split("#")[0].trim();
    if (!line) continue;

    const [key, ...rest] = line.split(":");
    const k = key.trim().toLowerCase();
    const v = rest.join(":").trim();

    if (k === "user-agent") {
      inBlock = v === "*" || v.toLowerCase().includes("sparky");
    } else if (k === "sitemap") {
      const resolved = normalizeUrl(v, origin);
      if (resolved) sitemaps.push(resolved);
    } else if (inBlock && k === "disallow" && v) {
      disallow.push(v);
    } else if (inBlock && k === "crawl-delay") {
      const n = parseFloat(v);
      if (!isNaN(n) && n > 0) crawlDelay = n * 1000;
    }
  }

  return { disallow, sitemaps, crawlDelay };
}

export function isAllowed(url: string, disallowRules: string[]): boolean {
  try {
    const path = new URL(url).pathname;
    return !disallowRules.some((rule) => path.startsWith(rule));
  } catch {
    return false;
  }
}

async function parseSitemap(url: string, origin: string, depth: number, collected?: { count: number }, maxPages?: number): Promise<string[]> {
  if (depth > 2) return [];
  collected = collected || { count: 0 };
  maxPages = maxPages || MAX_PAGES;
  const urls: string[] = [];
  try {
    const text = await fetchText(url);
    if (!text) return [];

    const locRe = /<loc>([^<]+)<\/loc>/gi;
    const isSitemapIndex = text.includes("<sitemapindex");
    let match;

    while ((match = locRe.exec(text)) !== null) {
      if (collected.count >= maxPages) break;
      const loc = match[1].trim();
      if (isSitemapIndex) {
        const nested = await parseSitemap(loc, origin, depth + 1, collected, maxPages);
        urls.push(...nested);
      } else {
        if (loc.startsWith(origin)) {
          urls.push(loc);
          collected.count++;
        }
      }
    }
  } catch {}
  return urls;
}

function cleanDom(doc: any): void {
  for (const tag of REMOVE_TAGS) {
    for (const el of [...doc.querySelectorAll(tag)]) el.remove();
  }
  for (const el of [...doc.querySelectorAll("[hidden]")]) el.remove();
  for (const el of [...doc.querySelectorAll('[role="navigation"], [role="banner"], [role="contentinfo"], [aria-hidden="true"]')]) {
    el.remove();
  }
}

function extractLinks(doc: any, pageUrl: string): string[] {
  const links: string[] = [];
  for (const a of doc.querySelectorAll("a[href]")) {
    const resolved = normalizeUrl(a.getAttribute("href"), pageUrl);
    if (resolved) links.push(resolved);
  }
  return links;
}

function headingPrefix(tag: string): string {
  return "#".repeat(parseInt(tag.charAt(1), 10)) + " ";
}

function tableToMarkdown(table: any): string {
  const rows: string[][] = [];
  for (const tr of table.querySelectorAll("tr")) {
    const cells: string[] = [];
    for (const cell of tr.querySelectorAll("th, td")) {
      cells.push(cell.textContent.trim().replace(/\|/g, "\\|").replace(/\n+/g, " "));
    }
    if (cells.length > 0) rows.push(cells);
  }
  if (rows.length === 0) return "";

  const colCount = Math.max(...rows.map((r) => r.length));
  const normalized = rows.map((r) => {
    while (r.length < colCount) r.push("");
    return r;
  });

  const lines: string[] = [];
  lines.push("| " + normalized[0].join(" | ") + " |");
  lines.push("| " + normalized[0].map(() => "---").join(" | ") + " |");
  for (let i = 1; i < normalized.length; i++) {
    lines.push("| " + normalized[i].join(" | ") + " |");
  }
  return lines.join("\n");
}

function domToMarkdown(root: any, pageUrl: string): { text: string; sections?: { offset: number; label?: string }[] } {
  const lines: string[] = [];
  const sections: { offset: number; label?: string }[] = [];

  function inlineText(node: any): string {
    if (node.nodeType === 3) return node.textContent || "";
    if (node.nodeType !== 1) return "";
    const tag = (node.tagName || "").toLowerCase();

    if (tag === "a") {
      const text = node.textContent.trim();
      const href = node.getAttribute("href");
      if (text && href) {
        const resolved = normalizeUrl(href, pageUrl);
        if (resolved && resolved !== text) return `[${text}](${resolved})`;
      }
      return text;
    }
    if (tag === "code") return "`" + (node.textContent || "").trim() + "`";
    if (tag === "strong" || tag === "b") return "**" + (node.textContent || "").trim() + "**";
    if (tag === "em" || tag === "i") return "*" + (node.textContent || "").trim() + "*";
    if (tag === "br") return "\n";
    if (tag === "img") {
      const alt = node.getAttribute("alt");
      return alt ? `[${alt}]` : "";
    }

    let result = "";
    for (const child of node.childNodes) result += inlineText(child);
    return result;
  }

  function walk(node: any, listDepth: number): void {
    if (node.nodeType === 3) {
      const text = node.textContent.trim();
      if (text) lines.push(text);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = (node.tagName || "").toLowerCase();
    if (REMOVE_TAGS.has(tag)) return;

    if (HEADING_TAGS.has(tag)) {
      const text = node.textContent.trim();
      if (text) {
        const offset = lines.join("\n").length;
        sections.push({ offset, label: text });
        lines.push("");
        lines.push(headingPrefix(tag) + text);
        lines.push("");
      }
      return;
    }

    if (tag === "pre") {
      const codeEl = node.querySelector("code");
      const raw = (codeEl || node).textContent || "";
      const langClass = (codeEl && codeEl.getAttribute("class")) || "";
      const langMatch = langClass.match(/language-(\w+)/);
      const lang = langMatch ? langMatch[1] : "";
      lines.push("");
      lines.push("```" + lang);
      lines.push(raw.trimEnd());
      lines.push("```");
      lines.push("");
      return;
    }

    if (tag === "code" && node.parentNode && (node.parentNode.tagName || "").toLowerCase() !== "pre") {
      const text = node.textContent.trim();
      if (text) lines.push("`" + text + "`");
      return;
    }

    if (tag === "table") {
      const md = tableToMarkdown(node);
      if (md) {
        lines.push("");
        lines.push(md);
        lines.push("");
      }
      return;
    }

    if (tag === "ul" || tag === "ol") {
      lines.push("");
      let idx = 0;
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        const childTag = (child.tagName || "").toLowerCase();
        if (childTag === "li") {
          idx++;
          const indent = "  ".repeat(listDepth);
          const bullet = tag === "ol" ? `${idx}. ` : "- ";
          const nested = child.querySelector("ul, ol");
          if (nested) {
            const textNodes: string[] = [];
            for (const n of child.childNodes) {
              if (n.nodeType === 1 && (n.tagName || "").toLowerCase().match(/^[uo]l$/)) continue;
              textNodes.push(inlineText(n));
            }
            const text = textNodes.join("").trim();
            if (text) lines.push(indent + bullet + text);
            walk(nested, listDepth + 1);
          } else {
            const text = inlineText(child).trim();
            if (text) lines.push(indent + bullet + text);
          }
        }
      }
      lines.push("");
      return;
    }

    if (tag === "blockquote") {
      const text = inlineText(node).trim();
      if (text) {
        lines.push("");
        for (const line of text.split("\n")) lines.push("> " + line);
        lines.push("");
      }
      return;
    }

    if (tag === "p") {
      const text = inlineText(node).trim();
      if (text) {
        lines.push("");
        lines.push(text);
        lines.push("");
      }
      return;
    }

    if (tag === "hr") {
      lines.push("");
      lines.push("---");
      lines.push("");
      return;
    }

    if (tag === "dl") {
      lines.push("");
      for (const child of node.childNodes) {
        if (child.nodeType !== 1) continue;
        const ct = (child.tagName || "").toLowerCase();
        if (ct === "dt") lines.push("**" + child.textContent.trim() + "**");
        if (ct === "dd") lines.push(": " + inlineText(child).trim());
      }
      lines.push("");
      return;
    }

    for (const child of node.childNodes) walk(child, listDepth);
  }

  walk(root, 0);

  const text = lines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return { text, sections: sections.length > 0 ? sections : undefined };
}

const CONSENT_PATTERNS = [
  { detect: /privacy-gate/, acceptPath: (html: string) => {
    const m = html.match(/decodeURIComponent\('([^']+privacy-gate[^']+)'\)/);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return null; }
  }},
];

async function tryConsentBypass(html: string, origin: string, timeoutMs?: number): Promise<string | null> {
  for (const pattern of CONSENT_PATTERNS) {
    if (!pattern.detect.test(html)) continue;
    const acceptUrl = pattern.acceptPath(html);
    if (!acceptUrl) continue;
    try {
      const res = await fetch(new URL(acceptUrl, origin).href, {
        headers: { "User-Agent": BROWSER_UA },
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs || TIMEOUT_MS),
      });
      const setCookie = res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")].filter(Boolean) as string[];
      if (setCookie.length > 0) {
        return setCookie.map((c) => c.split(";")[0]).join("; ");
      }
    } catch {}
  }
  return null;
}

export function extractPage(html: string, url: string) {
  const { document } = parseHTML(html);

  const links = extractLinks(document, url);

  const cloneDoc = parseHTML(html).document;
  let readabilityText: { text: string; sections?: { offset: number; label?: string }[] } | null = null;
  try {
    const reader = new Readability(cloneDoc, { charThreshold: 100 });
    const article = reader.parse();
    if (article && article.content && article.content.length > 200) {
      const { document: articleDoc } = parseHTML(article.content);
      const result = domToMarkdown(articleDoc.body || articleDoc, url);
      if (result.text.length > 100) {
        readabilityText = result;
        if (article.title && !result.text.startsWith("# ")) {
          readabilityText.text = "# " + article.title + "\n\n" + result.text;
        }
      }
    }
  } catch {}

  if (readabilityText) {
    return { ...readabilityText, links };
  }

  cleanDom(document);
  const main = document.querySelector("main, article, [role='main']");
  const root = main || document.body;
  if (!root) return { text: "", sections: undefined, links };

  const result = domToMarkdown(root, url);
  return { ...result, links };
}

async function tryLlmsTxt(origin: string, timeoutMs?: number) {
  for (const path of ["/llms-full.txt", "/llms.txt"]) {
    try {
      const text = await fetchText(`${origin}${path}`, timeoutMs);
      if (text && text.length > 100) {
        const sections: { offset: number; label?: string }[] = [];
        const re = /^#{1,3}\s+(.+)$/gm;
        let m;
        while ((m = re.exec(text)) !== null) {
          sections.push({ offset: m.index, label: m[1].trim() });
        }
        return { text, sections: sections.length > 0 ? sections : undefined };
      }
    } catch {}
  }
  return null;
}

export interface UrlExtractorOptions {
  maxDepth?: number;
  maxPages?: number;
  respectRobots?: boolean;
}

export function createUrlExtractor(options?: UrlExtractorOptions): FileMdConverter {
  const maxDepth = options?.maxDepth ?? MAX_DEPTH;
  const maxPages = options?.maxPages ?? MAX_PAGES;
  const respectRobots = options?.respectRobots ?? true;

  return {
    name: "url",
    extensions: [".url", "url"],
    async *extract(startUrl: string, log: (msg: string) => void): AsyncGenerator<ExtractionResult> {
      const parsed = new URL(startUrl);
      const origin = parsed.origin;
      const isRoot = parsed.pathname === "/" || parsed.pathname === "";

      const llms = isRoot ? await tryLlmsTxt(origin) : null;
      if (llms) {
        log(`Using llms.txt from ${origin} (${llms.text.length} chars)`);
        yield llms;
        return;
      }

      let disallow: string[] = [];
      let crawlDelay = DEFAULT_CRAWL_DELAY;
      let sitemapUrls: string[] = [];

      if (respectRobots) {
        try {
          const robotsTxt = await fetchText(`${origin}/robots.txt`);
          if (robotsTxt) {
            const robots = parseRobotsTxt(robotsTxt, origin);
            disallow = robots.disallow;
            crawlDelay = robots.crawlDelay;

            if (isRoot) {
              for (const sitemapUrl of robots.sitemaps) {
                const urls = await parseSitemap(sitemapUrl, origin, 0);
                sitemapUrls.push(...urls);
              }
            }
          }
        } catch {}
      }

      if (isRoot && sitemapUrls.length === 0) {
        const defaultSitemap = await parseSitemap(`${origin}/sitemap.xml`, origin, 0);
        sitemapUrls.push(...defaultSitemap);
      }

      const seen = new Set<string>();
      const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];

      for (const sUrl of sitemapUrls) {
        if (!seen.has(sUrl)) {
          queue.push({ url: sUrl, depth: 1 });
        }
      }

      let pageCount = 0;
      let consentCookie: string | null = null;

      while (queue.length > 0 && seen.size < maxPages) {
        const { url, depth } = queue.shift()!;
        if (seen.has(url)) continue;
        seen.add(url);
        if (shouldSkipExt(url)) continue;
        if (respectRobots && !isAllowed(url, disallow)) continue;

        if (crawlDelay > 0 && seen.size > 1) await sleep(crawlDelay);

        log(`Crawling [${seen.size}/${maxPages}] ${url}`);

        let html: string | undefined;
        try {
          const fetchHeaders: Record<string, string> = {
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          };
          if (consentCookie) fetchHeaders["Cookie"] = consentCookie;
          const res = await fetch(url, {
            headers: fetchHeaders,
            redirect: "follow",
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!res.ok) continue;
          const ct = res.headers.get("content-type") || "";
          if (!ct.includes("text/html") && !ct.includes("application/xhtml")) continue;
          html = await res.text();
        } catch {
          continue;
        }
        if (!html) continue;

        if (!consentCookie && pageCount === 0) {
          const cookie = await tryConsentBypass(html, origin);
          if (cookie) {
            consentCookie = cookie;
            log("Consent bypass: obtained cookies, re-fetching");
            seen.delete(url);
            queue.unshift({ url, depth });
            continue;
          }
        }

        const { text, sections, links } = extractPage(html, url);
        if (text) {
          pageCount++;
          yield { text: `[${url}]\n${text}`, sections };
        }

        if (depth < maxDepth) {
          for (const link of links) {
            if (!link.startsWith(origin)) continue;
            if (seen.has(link)) continue;
            queue.push({ url: link, depth: depth + 1 });
          }
        }
      }

      log(`Done: ${pageCount} pages crawled`);
    },
  };
}
