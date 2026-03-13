import { describe, expect, it } from "vitest";
import { MarkdownLexer, tokenize, tokenizeStream } from "../markdownLexer";

function types(content: string) {
  return tokenize(content).map((b) => b.type);
}

function blocks(content: string) {
  return tokenize(content).map((b) => ({ type: b.type, content: b.content }));
}

// ---------------------------------------------------------------------------
// tokenize — markdown
// ---------------------------------------------------------------------------
describe("tokenize — markdown", () => {
  it("given plain text, then single markdown block", () => {
    expect(types("Hello world")).toEqual(["markdown"]);
  });

  it("given multiline prose, then single markdown block", () => {
    expect(types("Line one\nLine two\nLine three")).toEqual(["markdown"]);
  });

  it("given empty string, then empty array", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("given whitespace only, then empty array", () => {
    expect(tokenize("   \n  \n  ")).toEqual([]);
  });

  it("given only newlines, then empty array", () => {
    expect(tokenize("\n\n\n")).toEqual([]);
  });

  it("given lines with inline $math$, then markdown", () => {
    expect(types("The value is $x^2$ here")).toEqual(["markdown"]);
  });

  it("given lines with inline $$math$$, then markdown (not standalone)", () => {
    expect(types("Inline $$E=mc^2$$ here")).toEqual(["markdown"]);
  });

  it("given bare ``` with nothing open, then markdown", () => {
    expect(types("```")).toEqual(["markdown"]);
  });
});

// ---------------------------------------------------------------------------
// tokenize — code blocks
// ---------------------------------------------------------------------------
describe("tokenize — code blocks", () => {
  it("given fenced code block, then code block with fences", () => {
    const result = blocks("```js\nconsole.log('hi');\n```");
    expect(result).toEqual([{ type: "code", content: "```js\nconsole.log('hi');\n```" }]);
  });

  it("given text before and after, then three blocks", () => {
    expect(types("before\n```\ncode\n```\nafter")).toEqual(["markdown", "code", "markdown"]);
  });

  it("given nested mermaid fence inside code, then fence closes at first triple-backtick", () => {
    const result = blocks("```md\nHere is mermaid:\n```mermaid\ngraph LR\n```");
    expect(result[0].type).toBe("code");
    expect(result[0].content).toBe("```md\nHere is mermaid:\n```");
  });

  it("given chart fence closed with trailing text, then chart block emitted and trailing text preserved", () => {
    const result = blocks("text\n```chart\n{\"a\":1}\n```There you go");
    expect(result[0]).toEqual({ type: "markdown", content: "text" });
    expect(result[1]).toEqual({ type: "chart", content: '{"a":1}' });
    expect(result[2].type).toBe("markdown");
    expect(result[2].content).toContain("There you go");
  });

  it("given code fence closed with trailing text, then code block emitted", () => {
    const result = blocks("```python\nprint(1)\n```done");
    expect(result[0].type).toBe("code");
    expect(result[1]).toEqual({ type: "markdown", content: "done" });
  });

  it("given unclosed code block, then markdown fallback with fence", () => {
    const result = blocks("before\n```js\nlet x = 1;");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "markdown", content: "before" });
    expect(result[1].type).toBe("markdown");
    expect(result[1].content).toContain("```js");
    expect(result[1].content).toContain("let x = 1;");
  });

  it("given empty code block, then code block emitted", () => {
    const result = blocks("```js\n```");
    expect(result).toEqual([{ type: "code", content: "```js\n\n```" }]);
  });

  it("given code block with blank lines, then all preserved", () => {
    const result = blocks("```js\nline1\n\nline3\n```");
    expect(result[0].content).toBe("```js\nline1\n\nline3\n```");
  });

  it("given multiple code blocks, then each separate", () => {
    expect(types("```a\n1\n```\ntext\n```b\n2\n```")).toEqual(["code", "markdown", "code"]);
  });

  it("given code block with lang containing special chars, then lang extracted", () => {
    const result = tokenize("```c++\nint x;\n```");
    expect(result[0].content).toContain("```c++");
  });

  it("given code block with lang and extra text, then first word is lang", () => {
    const result = tokenize("```python title=\"test\"\npass\n```");
    expect(result[0].content).toContain("```python");
  });

  it("given back-to-back code blocks no gap, then two code blocks", () => {
    expect(types("```a\n1\n```\n```b\n2\n```")).toEqual(["code", "code"]);
  });
});

// ---------------------------------------------------------------------------
// tokenize — mermaid blocks
// ---------------------------------------------------------------------------
describe("tokenize — mermaid blocks", () => {
  it("given mermaid fence, then mermaid content without fences", () => {
    const result = blocks("```mermaid\ngraph LR\n  A --> B\n```");
    expect(result).toEqual([{ type: "mermaid", content: "graph LR\n  A --> B" }]);
  });

  it("given text around mermaid, then three blocks", () => {
    expect(types("before\n```mermaid\ngraph LR\n```\nafter")).toEqual([
      "markdown", "mermaid", "markdown",
    ]);
  });

  it("given unclosed mermaid, then markdown fallback", () => {
    const result = blocks("```mermaid\ngraph LR\n  A --> B");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("```mermaid");
  });

  it("given empty mermaid, then no block emitted", () => {
    const result = tokenize("```mermaid\n```");
    expect(result).toEqual([]);
  });

  it("given mermaid with many lines, then all captured", () => {
    const result = blocks("```mermaid\ngraph LR\n  A --> B\n  B --> C\n  C --> D\n```");
    expect(result[0].content).toContain("C --> D");
  });
});

// ---------------------------------------------------------------------------
// tokenize — latex fenced
// ---------------------------------------------------------------------------
describe("tokenize — latex fenced", () => {
  it("given fenced latex, then latex without fences", () => {
    const result = blocks("```latex\n\\frac{1}{2}\n```");
    expect(result).toEqual([{ type: "latex", content: "\\frac{1}{2}" }]);
  });

  it("given unclosed fenced latex, then markdown fallback", () => {
    const result = blocks("```latex\n\\frac{1}{2}");
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("```latex");
  });

  it("given empty fenced latex, then no block", () => {
    expect(tokenize("```latex\n```")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// tokenize — latex $$ delimiters
// ---------------------------------------------------------------------------
describe("tokenize — $$ delimiters", () => {
  it("given $$ block, then latex without $$", () => {
    const result = blocks("$$\nE = mc^2\n$$");
    expect(result).toEqual([{ type: "latex", content: "E = mc^2" }]);
  });

  it("given text around $$, then splits", () => {
    expect(types("before\n$$\nx + y\n$$\nafter")).toEqual(["markdown", "latex", "markdown"]);
  });

  it("given unclosed $$, then markdown fallback", () => {
    const result = blocks("$$\nE = mc^2");
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("$$");
    expect(result[0].content).toContain("E = mc^2");
  });

  it("given multiline $$ with environments, then single latex", () => {
    const result = blocks("$$\n\\begin{bmatrix} 1 \\\\ 2 \\end{bmatrix}\n$$");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("latex");
  });

  it("given back-to-back $$ blocks, then two latex", () => {
    expect(types("$$\na\n$$\n$$\nb\n$$")).toEqual(["latex", "latex"]);
  });

  it("given empty $$ block, then no block", () => {
    expect(tokenize("$$\n$$")).toEqual([]);
  });

  it("given $$ with trailing spaces, then recognized", () => {
    const result = blocks("$$  \nE=mc^2\n$$  ");
    expect(result[0].type).toBe("latex");
  });

  it("given $$ with text after on same line, then not dollar fence", () => {
    expect(types("$$ some text")).toEqual(["markdown"]);
  });
});

// ---------------------------------------------------------------------------
// tokenize — latex environments
// ---------------------------------------------------------------------------
describe("tokenize — environments", () => {
  it("given begin/end, then latex", () => {
    expect(types("\\begin{align}\nx\n\\end{align}")).toEqual(["latex"]);
  });

  it("given nested environments, then single block", () => {
    const input = "\\begin{align}\n\\begin{cases}\nx\ny\n\\end{cases}\n\\end{align}";
    const result = blocks(input);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("latex");
  });

  it("given text before and after, then splits", () => {
    expect(types("text\n\\begin{equation}\nE=mc^2\n\\end{equation}\nmore")).toEqual([
      "markdown", "latex", "markdown",
    ]);
  });

  it("given single-line balanced, then latex", () => {
    expect(types("\\begin{bmatrix} 1 \\end{bmatrix}")).toEqual(["latex"]);
  });

  it("given multiple balanced on one line, then latex", () => {
    expect(types("\\begin{b} 1 \\end{b} = \\begin{b} 2 \\end{b}")).toEqual(["latex"]);
  });

  it("given multi-env line then text, then splits", () => {
    expect(
      types("\\begin{b} 1 \\end{b} = \\begin{b} 2 \\end{b}\n\nText"),
    ).toEqual(["latex", "markdown"]);
  });

  it("given unclosed begin at EOF, then latex (partial still valid)", () => {
    const result = blocks("\\begin{align}\nx = 1");
    expect(result[0].type).toBe("latex");
  });

  it("given leading whitespace before begin, then still detected", () => {
    expect(types("  \\begin{align}\n  x\n  \\end{align}")).toEqual(["latex"]);
  });

  it("given \\begingroup (no brace), then markdown", () => {
    expect(types("\\begingroup stuff")).toEqual(["markdown"]);
  });

  it("given deeply nested (3 levels), then single latex block", () => {
    const input = [
      "\\begin{align}",
      "\\begin{cases}",
      "\\begin{array}{c}",
      "x",
      "\\end{array}",
      "\\end{cases}",
      "\\end{align}",
    ].join("\n");
    expect(types(input)).toEqual(["latex"]);
  });
});

// ---------------------------------------------------------------------------
// tokenize — tables
// ---------------------------------------------------------------------------
describe("tokenize — tables", () => {
  it("given header + sep + rows, then table", () => {
    expect(types("| A | B |\n|---|---|\n| 1 | 2 |")).toEqual(["table"]);
  });

  it("given alignment markers, then table", () => {
    expect(types("| L | C | R |\n|:--|:--:|--:|\n| a | b | c |")).toEqual(["table"]);
  });

  it("given many data rows, then all included", () => {
    const input = "| H |\n|---|\n| r1 |\n| r2 |\n| r3 |\n| r4 |\n| r5 |";
    const result = blocks(input);
    expect(result).toHaveLength(1);
    expect(result[0].content).toContain("r5");
  });

  it("given text around table, then three blocks", () => {
    expect(types("intro\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\noutro")).toEqual([
      "markdown", "table", "markdown",
    ]);
  });

  it("given multiple tables, then five blocks", () => {
    const input =
      "intro\n| A | B |\n|---|---|\n| 1 | 2 |\nmiddle\n| C | D |\n|---|---|\n| 3 | 4 |\noutro";
    expect(types(input)).toEqual(["markdown", "table", "markdown", "table", "markdown"]);
  });

  it("given pipe in prose without separator, then markdown", () => {
    expect(types("this | is | not | a table\nnext line")).toEqual(["markdown"]);
  });

  it("given header then non-separator, then both markdown", () => {
    const result = blocks("| A | B |\nno sep here\nmore text");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("| A | B |");
    expect(result[0].content).toContain("no sep here");
  });

  it("given table then blank line, then table + markdown", () => {
    const result = types("| A | B |\n|---|---|\n| 1 | 2 |\n\ntext");
    expect(result).toEqual(["table", "markdown"]);
  });

  it("given single pipe only, then markdown", () => {
    expect(types("|")).toEqual(["markdown"]);
  });

  it("given table at very end of input (no trailing newline), then table", () => {
    expect(types("| A | B |\n|---|---|\n| 1 | 2 |")).toEqual(["table"]);
  });
});

// ---------------------------------------------------------------------------
// tokenize — mixed content
// ---------------------------------------------------------------------------
describe("tokenize — mixed content", () => {
  it("given markdown + mermaid + $$ + table, then all four types", () => {
    const input = [
      "# Hello", "",
      "```mermaid", "graph LR", "```", "",
      "$$", "\\frac{1}{2}", "$$", "",
      "| A | B |", "|---|---|", "| 1 | 2 |",
    ].join("\n");
    expect(types(input)).toEqual(["markdown", "mermaid", "latex", "table"]);
  });

  it("given code then mermaid then prose, then separates", () => {
    expect(types("```python\nprint('hi')\n```\n```mermaid\ngraph TD\n```\ndone")).toEqual([
      "code", "mermaid", "markdown",
    ]);
  });

  it("given $$ then \\begin then code, then three blocks", () => {
    const input = "$$\na\n$$\n\\begin{eq}\nb\n\\end{eq}\n```js\nc\n```";
    expect(types(input)).toEqual(["latex", "latex", "code"]);
  });

  it("given mermaid then $$ then table, then three types", () => {
    const input = [
      "```mermaid", "graph LR", "```",
      "$$", "x", "$$",
      "| A | B |", "|---|---|", "| 1 | 2 |",
    ].join("\n");
    expect(types(input)).toEqual(["mermaid", "latex", "table"]);
  });

  it("given alternating code and tables, then interleaved", () => {
    const input = [
      "```js", "1", "```",
      "| A | B |", "|---|---|", "| x | y |",
      "```py", "2", "```",
    ].join("\n");
    expect(types(input)).toEqual(["code", "table", "code"]);
  });

  it("given back-to-back fenced blocks no gap, then both detected", () => {
    expect(types("```js\n1\n```\n```mermaid\ngraph\n```")).toEqual(["code", "mermaid"]);
  });
});

// ---------------------------------------------------------------------------
// tokenize — real LLM output
// ---------------------------------------------------------------------------
describe("tokenize — real LLM output", () => {
  it("given bmatrix + prose + gantt, then latex + markdown + mermaid + markdown", () => {
    const input = [
      "\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix} \\begin{bmatrix} 5 \\\\ 6 \\end{bmatrix} = \\begin{bmatrix} 1 \\times 5 + 2 \\times 6 \\\\ 3 \\times 5 + 4 \\times 6 \\end{bmatrix} = \\begin{bmatrix} 17 \\\\ 39 \\end{bmatrix}",
      "",
      "Finally, a Gantt chart for a simple project:",
      "",
      "```mermaid",
      "gantt",
      "    title Simple Project Timeline",
      "    dateFormat YYYY-MM-DD",
      "    section Planning",
      "    Research     :done, r1, 2026-03-04, 2d",
      "    Design       :active, d1, after r1, 3d",
      "    section Execution",
      "    Development  :dev1, after d1, 5d",
      "    Testing      :test1, after dev1, 2d",
      "```",
      "",
      "---",
      "",
      "Let me know if you want to see more examples or a specific combination!",
    ].join("\n");
    const result = tokenize(input);
    const t = result.map((b) => b.type);
    expect(t).toEqual(["latex", "markdown", "mermaid", "markdown"]);
    expect(result[0].content).toContain("\\begin{bmatrix}");
    expect(result[1].content).toContain("Gantt chart");
    expect(result[2].content).toContain("gantt");
    expect(result[3].content).toContain("Let me know");
  });

  it("given bmatrix with trailing $$ + gantt, then splits all", () => {
    const input = [
      "\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix} \\begin{bmatrix} 5 \\\\ 6 \\end{bmatrix} = \\begin{bmatrix} 17 \\\\ 39 \\end{bmatrix} $$",
      "",
      "Finally, a Gantt chart for a simple project:",
      "",
      "```mermaid",
      "gantt",
      "    title Simple Project Timeline",
      "    dateFormat YYYY-MM-DD",
      "    section Planning",
      "    Research     :done, r1, 2026-03-04, 2d",
      "```",
      "",
      "Let me know!",
    ].join("\n");
    const result = tokenize(input);
    expect(result.map((b) => b.type)).toEqual(["latex", "markdown", "mermaid", "markdown"]);
  });

  it("given $$ wrapped bmatrix + gantt, then splits all", () => {
    const input = [
      "$$",
      "\\begin{bmatrix} 1 & 2 \\end{bmatrix}",
      "$$",
      "",
      "Here is a chart:",
      "",
      "```mermaid",
      "gantt",
      "    title Plan",
      "```",
      "",
      "Done!",
    ].join("\n");
    expect(types(input)).toEqual(["latex", "markdown", "mermaid", "markdown"]);
  });

  it("given typical assistant response with code + explanation, then correct", () => {
    const input = [
      "Here's the solution:",
      "",
      "```python",
      "def fibonacci(n):",
      "    if n <= 1:",
      "        return n",
      "    return fibonacci(n-1) + fibonacci(n-2)",
      "```",
      "",
      "This uses recursion. The time complexity is $O(2^n)$.",
    ].join("\n");
    const result = tokenize(input);
    expect(result.map((b) => b.type)).toEqual(["markdown", "code", "markdown"]);
    expect(result[2].content).toContain("$O(2^n)$");
  });

  it("given response with multiple code blocks and explanation, then alternates", () => {
    const input = [
      "First, the HTML:",
      "",
      "```html",
      "<div>Hello</div>",
      "```",
      "",
      "Then the CSS:",
      "",
      "```css",
      "div { color: red; }",
      "```",
      "",
      "And finally the JS:",
      "",
      "```javascript",
      "document.querySelector('div');",
      "```",
    ].join("\n");
    expect(types(input)).toEqual([
      "markdown", "code", "markdown", "code", "markdown", "code",
    ]);
  });

  it("given response with table + follow-up, then table + markdown", () => {
    const input = [
      "Here are the results:",
      "",
      "| Model | Accuracy | F1 |",
      "|-------|----------|-----|",
      "| GPT-4 | 95.2% | 0.94 |",
      "| Claude | 94.8% | 0.93 |",
      "| Llama | 89.1% | 0.87 |",
      "",
      "As you can see, GPT-4 leads slightly.",
    ].join("\n");
    expect(types(input)).toEqual(["markdown", "table", "markdown"]);
  });
});

// ---------------------------------------------------------------------------
// tokenize — edge cases
// ---------------------------------------------------------------------------
describe("tokenize — edge cases", () => {
  it("given single $$ line, then markdown fallback", () => {
    const result = blocks("$$");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("markdown");
  });

  it("given bare ``` in markdown context, then opens code block", () => {
    expect(types("text\n```\nmore\n```\nafter")).toEqual(["markdown", "code", "markdown"]);
  });

  it("given bare ``` unclosed, then markdown fallback", () => {
    const result = blocks("text\n```\nmore");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ type: "markdown", content: "text" });
    expect(result[1].type).toBe("markdown");
    expect(result[1].content).toContain("more");
  });

  it("given very long single line, then markdown", () => {
    const long = "a".repeat(10000);
    expect(types(long)).toEqual(["markdown"]);
  });

  it("given code block then immediate EOF, then code finalized", () => {
    expect(types("```js\ncode\n```")).toEqual(["code"]);
  });

  it("given $$ containing ``` inside, then $$ takes precedence", () => {
    const result = blocks("$$\n```\n\\alpha\n```\n$$");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("latex");
    expect(result[0].content).toContain("```");
  });

  it("given code block containing $$ inside, then code takes precedence", () => {
    const result = blocks("```js\nconst x = '$$';\n$$\n```");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("code");
  });

  it("given code block containing \\begin inside, then code takes precedence", () => {
    const result = blocks("```tex\n\\begin{align}\nx\n\\end{align}\n```");
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("code");
  });

  it("given table containing code fence after, then table closes first", () => {
    const input = "| A | B |\n|---|---|\n| 1 | 2 |\n```js\ncode\n```";
    expect(types(input)).toEqual(["table", "code"]);
  });

  it("given line with only spaces and backticks, then fence close", () => {
    const result = blocks("```js\ncode\n   ```   ");
    expect(result[0].type).toBe("code");
  });

  it("given windows-style line endings stripped, then works", () => {
    expect(types("```js\r\ncode\r\n```")).toEqual(["code"]);
  });

  it("given content is only a closing fence, then markdown", () => {
    expect(types("```")).toEqual(["markdown"]);
  });

  it("given consecutive blank lines between blocks, then markdown between", () => {
    expect(types("```js\n1\n```\n\n\n\n```py\n2\n```")).toEqual(["code", "code"]);
  });

  it("given no content lost after tokenize, then everything is present", () => {
    const input = "text\n```mermaid\ngraph\n```\nmore\n$$\n\\alpha\n$$\nend";
    const result = tokenize(input);
    const all = result.map((b) => b.content).join("\n");
    expect(all).toContain("text");
    expect(all).toContain("graph");
    expect(all).toContain("more");
    expect(all).toContain("\\alpha");
    expect(all).toContain("end");
  });
});

// ---------------------------------------------------------------------------
// tokenizeStream — basic
// ---------------------------------------------------------------------------
describe("tokenizeStream — basic", () => {
  it("given empty string, then no blocks no pending", () => {
    const r = tokenizeStream("");
    expect(r.blocks).toEqual([]);
    expect(r.pending).toBe("");
  });

  it("given text without newline, then all pending", () => {
    const r = tokenizeStream("hello world");
    expect(r.blocks).toEqual([]);
    expect(r.pending).toBe("hello world");
  });

  it("given complete line + partial, then pending includes both", () => {
    const r = tokenizeStream("hello\nwor");
    expect(r.pending).toContain("hello");
    expect(r.pending).toContain("wor");
  });

  it("given complete markdown lines with trailing newline, then all pending", () => {
    const r = tokenizeStream("line one\nline two\n");
    expect(r.pending).toContain("line one");
    expect(r.pending).toContain("line two");
  });
});

// ---------------------------------------------------------------------------
// tokenizeStream — fenced blocks
// ---------------------------------------------------------------------------
describe("tokenizeStream — fenced blocks", () => {
  it("given complete mermaid block, then finalized", () => {
    const r = tokenizeStream("text\n```mermaid\ngraph LR\n```\nmore");
    expect(r.blocks.map((b) => b.type)).toEqual(["markdown", "mermaid"]);
    expect(r.pending).toBe("more");
  });

  it("given unclosed mermaid, then fence in pending", () => {
    const r = tokenizeStream("text\n```mermaid\ngraph LR\nA --> B");
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].type).toBe("markdown");
    expect(r.pending).toContain("```mermaid");
    expect(r.pending).toContain("graph LR");
  });

  it("given unclosed code, then fence in pending", () => {
    const r = tokenizeStream("intro\n```js\nconst x = 1;");
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].content).toBe("intro");
    expect(r.pending).toContain("```js");
    expect(r.pending).toContain("const x = 1;");
  });

  it("given closed code then trailing, then code finalized", () => {
    const r = tokenizeStream("```js\nconst x = 1;\n```\ndone");
    expect(r.blocks.map((b) => b.type)).toEqual(["code"]);
    expect(r.pending).toBe("done");
  });

  it("given open fence with no content yet, then fence in pending", () => {
    const r = tokenizeStream("text\n```python\n");
    expect(r.pending).toContain("```python");
  });
});

// ---------------------------------------------------------------------------
// tokenizeStream — $$ blocks
// ---------------------------------------------------------------------------
describe("tokenizeStream — $$ blocks", () => {
  it("given closed $$ block, then latex finalized", () => {
    const r = tokenizeStream("$$\n\\frac{1}{2}\n$$\nmore");
    expect(r.blocks.some((b) => b.type === "latex")).toBe(true);
    expect(r.pending).toBe("more");
  });

  it("given unclosed $$ block, then $$ in pending", () => {
    const r = tokenizeStream("intro\n$$\nE = mc^2");
    expect(r.blocks).toHaveLength(1);
    expect(r.blocks[0].type).toBe("markdown");
    expect(r.pending).toContain("$$");
    expect(r.pending).toContain("E = mc^2");
  });
});

// ---------------------------------------------------------------------------
// tokenizeStream — environments
// ---------------------------------------------------------------------------
describe("tokenizeStream — environments", () => {
  it("given closed environment, then latex finalized", () => {
    const r = tokenizeStream("\\begin{align}\nx = 1\n\\end{align}\nmore");
    expect(r.blocks.some((b) => b.type === "latex")).toBe(true);
    expect(r.pending).toBe("more");
  });

  it("given unclosed environment, then env in pending", () => {
    const r = tokenizeStream("\\begin{align}\nx = 1");
    expect(r.pending).toContain("\\begin{align}");
    expect(r.pending).toContain("x = 1");
  });
});

// ---------------------------------------------------------------------------
// tokenizeStream — tables
// ---------------------------------------------------------------------------
describe("tokenizeStream — tables", () => {
  it("given table + non-pipe line with newline, then table finalized", () => {
    const r = tokenizeStream("| A | B |\n|---|---|\n| 1 | 2 |\nafter\n");
    expect(r.blocks.some((b) => b.type === "table")).toBe(true);
    expect(r.pending).toContain("after");
  });

  it("given table without trailing non-pipe, then table in pending", () => {
    const r = tokenizeStream("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(r.pending).toContain("| A | B |");
  });

  it("given header only (TABLE_MAYBE), then header in pending", () => {
    const r = tokenizeStream("| A | B |");
    expect(r.pending).toBe("| A | B |");
  });

  it("given header + non-sep, then both in pending as markdown", () => {
    const r = tokenizeStream("| A | B |\nno sep");
    expect(r.pending).toContain("| A | B |");
    expect(r.pending).toContain("no sep");
  });
});

// ---------------------------------------------------------------------------
// tokenizeStream — content preservation
// ---------------------------------------------------------------------------
describe("tokenizeStream — content preservation", () => {
  it("given mixed content, then blocks + pending cover everything", () => {
    const input = "hello\n```mermaid\ngraph\n```\nworld\ntrailing";
    const r = tokenizeStream(input);
    const all = r.blocks.map((b) => b.content).join("\n") + "\n" + r.pending;
    expect(all).toContain("hello");
    expect(all).toContain("graph");
    expect(all).toContain("world");
    expect(all).toContain("trailing");
  });

  it("given bmatrix then gantt streaming, then splits correctly", () => {
    const input =
      "\\begin{bmatrix} 1 \\end{bmatrix}\n" +
      "Some text\n" +
      "```mermaid\ngantt\n    title Plan\n```\n" +
      "Done";
    const r = tokenizeStream(input);
    expect(r.blocks.map((b) => b.type)).toEqual(["latex", "markdown", "mermaid"]);
    expect(r.pending).toBe("Done");
  });
});

// ---------------------------------------------------------------------------
// MarkdownLexer class — push incremental
// ---------------------------------------------------------------------------
describe("MarkdownLexer — incremental push", () => {
  it("given content pushed char-by-char, then finalize matches all-at-once", () => {
    const input = "text\n```js\ncode\n```\nend";
    const lex = new MarkdownLexer();
    for (const ch of input) lex.push(ch);
    const result = lex.finalize();
    expect(result.map((b) => b.type)).toEqual(tokenize(input).map((b) => b.type));
  });

  it("given content pushed line-by-line, then finalize matches all-at-once", () => {
    const input = "before\n```mermaid\ngraph\n```\nafter";
    const lines = input.split("\n");
    const lex = new MarkdownLexer();
    for (let i = 0; i < lines.length; i++) {
      lex.push(lines[i] + (i < lines.length - 1 ? "\n" : ""));
    }
    const result = lex.finalize();
    const expected = tokenize(input);
    expect(result.map((b) => b.type)).toEqual(expected.map((b) => b.type));
    expect(result.map((b) => b.content)).toEqual(expected.map((b) => b.content));
  });

  it("given drain called twice without push, then identical", () => {
    const lex = new MarkdownLexer();
    lex.push("text\n```js\ncode");
    const d1 = lex.drain();
    const d2 = lex.drain();
    expect(d1).toEqual(d2);
  });

  it("given drain blocks only grow after push, then monotonic", () => {
    const lex = new MarkdownLexer();
    lex.push("text\n");
    const d0 = lex.drain();

    lex.push("```js\n");
    const d1 = lex.drain();
    expect(d1.blocks.length).toBeGreaterThanOrEqual(d0.blocks.length);

    lex.push("code\n```\n");
    const d2 = lex.drain();
    expect(d2.blocks.length).toBeGreaterThanOrEqual(d1.blocks.length);

    lex.push("```mermaid\ngraph\n```\n");
    const d3 = lex.drain();
    expect(d3.blocks.length).toBeGreaterThanOrEqual(d2.blocks.length);
  });

  it("given drain blocks are prefix of finalize, then consistent", () => {
    const lex = new MarkdownLexer();
    lex.push("text\n```js\ncode\n```\nmore\n$$\nalpha\n");
    const drained = lex.drain();

    const lex2 = new MarkdownLexer();
    lex2.push("text\n```js\ncode\n```\nmore\n$$\nalpha\n");
    lex2.push("$$\nend");
    const finalized = lex2.finalize();

    for (let i = 0; i < drained.blocks.length; i++) {
      expect(drained.blocks[i].type).toBe(finalized[i].type);
      expect(drained.blocks[i].content).toBe(finalized[i].content);
    }
  });

  it("given large streaming simulation, then no crashes", () => {
    const input = [
      "# Title\n\nSome intro.\n\n",
      "```python\ndef foo():\n    return 42\n```\n\n",
      "More text with $x^2$ inline math.\n\n",
      "$$\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n$$\n\n",
      "| Col1 | Col2 |\n|------|------|\n| a | b |\n| c | d |\n\n",
      "```mermaid\ngraph TD\n  A --> B\n  B --> C\n```\n\n",
      "\\begin{align}\n  x &= y + z \\\\\n  w &= 1\n\\end{align}\n\n",
      "Conclusion.\n",
    ];

    const lex = new MarkdownLexer();
    for (const chunk of input) {
      lex.push(chunk);
      const d = lex.drain();
      expect(d.blocks).toBeDefined();
      expect(typeof d.pending).toBe("string");
    }
    const result = lex.finalize();
    const typeList = result.map((b) => b.type);
    expect(typeList).toContain("markdown");
    expect(typeList).toContain("code");
    expect(typeList).toContain("latex");
    expect(typeList).toContain("table");
    expect(typeList).toContain("mermaid");
  });
});

// ---------------------------------------------------------------------------
// tokenizeStream — pending block detection (all block types hidden during stream)
// ---------------------------------------------------------------------------
describe("tokenizeStream — incomplete blocks produce detectable pending", () => {
  it("given unclosed mermaid, then pending starts with ```mermaid", () => {
    const r = tokenizeStream("text\n```mermaid\ngraph LR\nA --> B");
    expect(r.pending.startsWith("```mermaid")).toBe(true);
  });

  it("given unclosed code, then pending starts with ```", () => {
    const r = tokenizeStream("text\n```js\nconst x = 1;");
    expect(r.pending.trimStart().startsWith("```")).toBe(true);
  });

  it("given unclosed latex fence, then pending starts with ```latex", () => {
    const r = tokenizeStream("text\n```latex\n\\frac{1}{2}");
    expect(r.pending.trimStart().startsWith("```latex")).toBe(true);
  });

  it("given unclosed $$ block, then pending starts with $$", () => {
    const r = tokenizeStream("text\n$$\nE = mc^2");
    expect(r.pending.trimStart().startsWith("$$")).toBe(true);
  });

  it("given unclosed \\begin env, then pending starts with \\begin{", () => {
    const r = tokenizeStream("text\n\\begin{align}\nx = 1");
    expect(r.pending.trimStart().startsWith("\\begin{")).toBe(true);
  });

  it("given unclosed table, then pending starts with |", () => {
    const r = tokenizeStream("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(r.pending.trimStart().startsWith("|")).toBe(true);
  });

  it("given table header only (TMAYBE), then pending starts with |", () => {
    const r = tokenizeStream("| A | B |");
    expect(r.pending.trimStart().startsWith("|")).toBe(true);
  });

  it("given plain markdown pending, then no block prefix", () => {
    const r = tokenizeStream("Hello world");
    const t = r.pending.trimStart();
    expect(t.startsWith("```")).toBe(false);
    expect(t.startsWith("$$")).toBe(false);
    expect(t.startsWith("\\begin{")).toBe(false);
    expect(t.startsWith("|")).toBe(false);
  });

  it("given completed mermaid + trailing text, then pending is plain", () => {
    const r = tokenizeStream("```mermaid\ngraph LR\n```\nsome text");
    expect(r.blocks.some((b) => b.type === "mermaid")).toBe(true);
    expect(r.pending).toBe("some text");
  });

  it("given completed code + trailing text, then pending is plain", () => {
    const r = tokenizeStream("```js\nconst x = 1;\n```\nsome text");
    expect(r.blocks.some((b) => b.type === "code")).toBe(true);
    expect(r.pending).toBe("some text");
  });

  it("given completed latex $$ + trailing text, then pending is plain", () => {
    const r = tokenizeStream("$$\nE = mc^2\n$$\nsome text");
    expect(r.blocks.some((b) => b.type === "latex")).toBe(true);
    expect(r.pending).toBe("some text");
  });

  it("given completed table + trailing text, then pending is plain", () => {
    const r = tokenizeStream("| A | B |\n|---|---|\n| 1 | 2 |\nafter\n");
    expect(r.blocks.some((b) => b.type === "table")).toBe(true);
    expect(r.pending).toContain("after");
  });

  it("given completed \\begin env + trailing text, then pending is plain", () => {
    const r = tokenizeStream("\\begin{align}\nx = 1\n\\end{align}\nmore");
    expect(r.blocks.some((b) => b.type === "latex")).toBe(true);
    expect(r.pending).toBe("more");
  });
});

// ---------------------------------------------------------------------------
// MarkdownLexer — finalize edge cases
// ---------------------------------------------------------------------------
describe("MarkdownLexer — finalize edge cases", () => {
  it("given finalize called twice, then same result", () => {
    const lex = new MarkdownLexer();
    lex.push("hello\n```js\ncode\n```");
    const r1 = lex.finalize();
    const r2 = lex.finalize();
    expect(r1).toEqual(r2);
  });

  it("given TABLE_MAYBE at EOF, then held row becomes markdown", () => {
    const lex = new MarkdownLexer();
    lex.push("| A | B |");
    const result = lex.finalize();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("| A | B |");
  });

  it("given open table at EOF, then table emitted", () => {
    const lex = new MarkdownLexer();
    lex.push("| A | B |\n|---|---|\n| 1 | 2 |");
    const result = lex.finalize();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("table");
  });

  it("given unclosed latex env at EOF, then latex emitted", () => {
    const lex = new MarkdownLexer();
    lex.push("\\begin{align}\nx = 1");
    const result = lex.finalize();
    expect(result[0].type).toBe("latex");
  });

  it("given unclosed $$ at EOF, then markdown fallback", () => {
    const lex = new MarkdownLexer();
    lex.push("$$\nE = mc^2");
    const result = lex.finalize();
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("$$");
  });

  it("given unclosed code at EOF, then markdown fallback", () => {
    const lex = new MarkdownLexer();
    lex.push("```js\ncode");
    const result = lex.finalize();
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("```js");
  });

  it("given unclosed mermaid at EOF, then markdown fallback", () => {
    const lex = new MarkdownLexer();
    lex.push("```mermaid\ngraph LR");
    const result = lex.finalize();
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("```mermaid");
  });

  it("given unclosed latex fence at EOF, then markdown fallback", () => {
    const lex = new MarkdownLexer();
    lex.push("```latex\n\\alpha");
    const result = lex.finalize();
    expect(result[0].type).toBe("markdown");
    expect(result[0].content).toContain("```latex");
  });
});
