import { describe, test, expect } from "vitest";
import {
  shouldSkipExt,
  normalizeUrl,
  parseRobotsTxt,
  isAllowed,
  extractPage,
  createUrlExtractor,
} from "../kt.url.converter";

describe("shouldSkipExt", () => {
  test("given image url, when checked, then returns true", () => {
    expect(shouldSkipExt("https://example.com/photo.png")).toBe(true);
    expect(shouldSkipExt("https://example.com/logo.jpg")).toBe(true);
    expect(shouldSkipExt("https://example.com/icon.svg")).toBe(true);
  });

  test("given static asset url, when checked, then returns true", () => {
    expect(shouldSkipExt("https://example.com/style.css")).toBe(true);
    expect(shouldSkipExt("https://example.com/app.js")).toBe(true);
    expect(shouldSkipExt("https://example.com/font.woff2")).toBe(true);
  });

  test("given html url, when checked, then returns false", () => {
    expect(shouldSkipExt("https://example.com/page.html")).toBe(false);
  });

  test("given url without extension, when checked, then returns false", () => {
    expect(shouldSkipExt("https://example.com/about")).toBe(false);
  });
});

describe("normalizeUrl", () => {
  test("given relative href, when normalized, then resolves to absolute", () => {
    expect(normalizeUrl("/about", "https://example.com")).toBe("https://example.com/about");
  });

  test("given url with hash, when normalized, then hash is stripped", () => {
    expect(normalizeUrl("https://example.com/page#section", "https://example.com"))
      .toBe("https://example.com/page");
  });

  test("given url with query, when normalized, then query is stripped", () => {
    expect(normalizeUrl("https://example.com/page?q=1", "https://example.com"))
      .toBe("https://example.com/page");
  });

  test("given invalid href, when normalized, then returns null", () => {
    expect(normalizeUrl("://broken", "not-a-url")).toBeNull();
  });
});

describe("parseRobotsTxt", () => {
  test("given robots with disallow rules, when parsed, then extracts rules", () => {
    const txt = "User-agent: *\nDisallow: /admin\nDisallow: /private\n";
    const result = parseRobotsTxt(txt, "https://example.com");
    expect(result.disallow).toEqual(["/admin", "/private"]);
  });

  test("given robots with sitemap, when parsed, then extracts sitemap urls", () => {
    const txt = "User-agent: *\nSitemap: https://example.com/sitemap.xml\n";
    const result = parseRobotsTxt(txt, "https://example.com");
    expect(result.sitemaps).toEqual(["https://example.com/sitemap.xml"]);
  });

  test("given robots with crawl-delay, when parsed, then extracts delay in ms", () => {
    const txt = "User-agent: *\nCrawl-delay: 2\n";
    const result = parseRobotsTxt(txt, "https://example.com");
    expect(result.crawlDelay).toBe(2000);
  });

  test("given robots without crawl-delay, when parsed, then delay is zero", () => {
    const txt = "User-agent: *\nDisallow: /admin\n";
    const result = parseRobotsTxt(txt, "https://example.com");
    expect(result.crawlDelay).toBe(0);
  });

  test("given robots with non-matching user-agent, when parsed, then no rules", () => {
    const txt = "User-agent: Googlebot\nDisallow: /secret\n";
    const result = parseRobotsTxt(txt, "https://example.com");
    expect(result.disallow).toEqual([]);
  });
});

describe("isAllowed", () => {
  test("given allowed path, when checked, then returns true", () => {
    expect(isAllowed("https://example.com/about", ["/admin"])).toBe(true);
  });

  test("given disallowed path, when checked, then returns false", () => {
    expect(isAllowed("https://example.com/admin/users", ["/admin"])).toBe(false);
  });

  test("given no rules, when checked, then returns true", () => {
    expect(isAllowed("https://example.com/anything", [])).toBe(true);
  });
});

describe("extractPage", () => {
  test("given simple html, when extracted, then returns markdown text", () => {
    const html = "<html><body><h1>Title</h1><p>Hello world</p></body></html>";
    const result = extractPage(html, "https://example.com");
    expect(result.text).toContain("Title");
    expect(result.text).toContain("Hello world");
  });

  test("given html with headings, when extracted, then includes sections", () => {
    const html = "<html><body><h1>Main</h1><p>Intro</p><h2>Details</h2><p>Content</p></body></html>";
    const result = extractPage(html, "https://example.com");
    expect(result.sections).toBeDefined();
    expect(result.sections!.some((s) => s.label === "Main")).toBe(true);
    expect(result.sections!.some((s) => s.label === "Details")).toBe(true);
  });

  test("given html with links, when extracted, then returns links", () => {
    const html = '<html><body><a href="/about">About</a><a href="https://other.com">Other</a></body></html>';
    const result = extractPage(html, "https://example.com");
    expect(result.links).toContain("https://example.com/about");
    expect(result.links).toContain("https://other.com/");
  });

  test("given html with table, when extracted, then renders markdown table", () => {
    const html = "<html><body><table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table></body></html>";
    const result = extractPage(html, "https://example.com");
    expect(result.text).toContain("Name");
    expect(result.text).toContain("Alice");
    expect(result.text).toContain("|");
  });

  test("given html with code block, when extracted, then renders fenced code", () => {
    const html = '<html><body><pre><code class="language-js">const x = 1;</code></pre></body></html>';
    const result = extractPage(html, "https://example.com");
    expect(result.text).toContain("```js");
    expect(result.text).toContain("const x = 1;");
  });

  test("given html with script and style, when extracted, then strips them", () => {
    const html = "<html><body><script>alert(1)</script><style>.x{}</style><p>Clean</p></body></html>";
    const result = extractPage(html, "https://example.com");
    expect(result.text).not.toContain("alert");
    expect(result.text).not.toContain(".x{}");
    expect(result.text).toContain("Clean");
  });

  test("given empty body, when extracted, then returns empty text", () => {
    const html = "<html><body></body></html>";
    const result = extractPage(html, "https://example.com");
    expect(result.text).toBe("");
  });
});

describe("createUrlExtractor", () => {
  test("given extractor, when created, then has url extensions", () => {
    const ext = createUrlExtractor();
    expect(ext.extensions).toContain(".url");
    expect(ext.extensions).toContain("url");
  });

  test("given extractor, when created, then has name", () => {
    const ext = createUrlExtractor();
    expect(ext.name).toBe("url");
  });
});
