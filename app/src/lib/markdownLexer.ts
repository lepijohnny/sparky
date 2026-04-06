export interface ContentBlock { type: string; content: string }
export interface BlockRenderer { type: string; render: (content: string, key: string) => unknown }

const S_MD = 0, S_CODE = 1, S_MERMAID = 2, S_LATEXF = 3, S_LATEXD = 4, S_LATEXE = 5, S_TABLE = 6, S_TMAYBE = 7, S_LATEXB = 8, S_CHART = 9, S_HTML = 10;

function ws(c: number) { return c === 0x20 || c === 0x09; }

function fence(s: string, i: number, end: number): number {
  if (end - i < 3 || s.charCodeAt(i) !== 0x60 || s.charCodeAt(i + 1) !== 0x60 || s.charCodeAt(i + 2) !== 0x60) return 0;
  let j = i + 3;
  while (j < end && ws(s.charCodeAt(j))) j++;
  return j === end ? 1 : 2; // 1 = close, 2 = open
}

function lang(s: string, i: number, end: number): string {
  let j = i + 3;
  while (j < end && ws(s.charCodeAt(j))) j++;
  const k = j;
  while (j < end && !ws(s.charCodeAt(j))) j++;
  return s.slice(k, j);
}

function dollar(s: string, i: number, end: number): boolean {
  if (end - i < 2 || s.charCodeAt(i) !== 0x24 || s.charCodeAt(i + 1) !== 0x24) return false;
  let j = i + 2;
  while (j < end && ws(s.charCodeAt(j))) j++;
  return j === end;
}

function bracketOpen(s: string, i: number, end: number): boolean {
  if (end - i < 2) return false;
  return s.charCodeAt(i) === 0x5c && s.charCodeAt(i + 1) === 0x5b; // \[
}

function bracketClose(s: string, i: number, end: number): boolean {
  if (end - i < 2) return false;
  const j = end - 1;
  let k = j;
  while (k > i && ws(s.charCodeAt(k))) k--;
  if (k < i + 1) return false;
  return s.charCodeAt(k - 1) === 0x5c && s.charCodeAt(k) === 0x5d; // \]
}

function beginEnv(s: string, i: number, end: number): boolean {
  return end - i >= 7 && s.charCodeAt(i) === 0x5c && s.charCodeAt(i + 1) === 0x62 &&
    s.charCodeAt(i + 2) === 0x65 && s.charCodeAt(i + 3) === 0x67 &&
    s.charCodeAt(i + 4) === 0x69 && s.charCodeAt(i + 5) === 0x6e && s.charCodeAt(i + 6) === 0x7b;
}

function envDelta(s: string, i: number, end: number): number {
  let d = 0;
  for (; i < end - 4; i++) {
    if (s.charCodeAt(i) !== 0x5c) continue;
    if (i + 6 < end && s.charCodeAt(i+1)===0x62 && s.charCodeAt(i+2)===0x65 && s.charCodeAt(i+3)===0x67 && s.charCodeAt(i+4)===0x69 && s.charCodeAt(i+5)===0x6e && s.charCodeAt(i+6)===0x7b) d++;
    if (i + 4 < end && s.charCodeAt(i+1)===0x65 && s.charCodeAt(i+2)===0x6e && s.charCodeAt(i+3)===0x64 && s.charCodeAt(i+4)===0x7b) d--;
  }
  return d;
}

function pipeRow(s: string, i: number, end: number): boolean {
  return end - i >= 3 && s.charCodeAt(i) === 0x7c && s.charCodeAt(end - 1) === 0x7c;
}

function sepRow(s: string, i: number, end: number): boolean {
  if (!pipeRow(s, i, end)) return false;
  let inner = false;
  for (let j = i + 1; j < end - 1; j++) {
    const c = s.charCodeAt(j);
    if (c === 0x7c) inner = true;
    else if (c !== 0x2d && c !== 0x3a && !ws(c)) return false;
  }
  return inner;
}

export class MarkdownLexer {
  private B: ContentBlock[] = [];
  private md: string[] = [];
  private bb: string[] = [];
  private s = S_MD;
  private cl = "";
  private ed = 0;
  private hr = "";
  private lb = "";

  push(chunk: string): void {
    let p = 0;
    const n = chunk.length;
    while (p < n) {
      const nl = chunk.indexOf("\n", p);
      if (nl === -1) { this.lb += chunk.slice(p); break; }
      const line = this.lb ? this.lb + chunk.slice(p, nl) : chunk.slice(p, nl);
      this.lb = "";
      this.line(line);
      p = nl + 1;
    }
  }

  drain(): { blocks: ContentBlock[]; pending: string } {
    const parts: string[] = [];
    if (this.s === S_CODE) parts.push("```" + this.cl, ...this.bb);
    else if (this.s === S_MERMAID) parts.push("```mermaid", ...this.bb);
    else if (this.s === S_CHART) parts.push("```chart", ...this.bb);
    else if (this.s === S_HTML) parts.push("```html", ...this.bb);
    else if (this.s === S_LATEXF) parts.push("```latex", ...this.bb);
    else if (this.s === S_LATEXD) parts.push("$$", ...this.bb);
    else if (this.s === S_LATEXB) parts.push("\\[", ...this.bb);
    else if (this.s === S_LATEXE || this.s === S_TABLE) parts.push(...this.bb);
    if (this.s === S_TMAYBE) parts.push(this.hr);
    if (this.md.length) parts.push(...this.md);
    if (this.lb) parts.push(this.lb);
    return { blocks: this.B.slice(), pending: parts.join("\n") };
  }

  finalize(): ContentBlock[] {
    if (this.lb) { const l = this.lb; this.lb = ""; this.line(l); }
    if (this.s === S_TMAYBE) { this.md.push(this.hr); this.hr = ""; this.s = S_MD; }
    switch (this.s) {
      case S_TABLE: this.emit("table"); break;
      case S_LATEXE: this.emit("latex"); break;
      case S_CODE: this.md.push("```" + this.cl, ...this.bb); this.bb.length = 0; break;
      case S_MERMAID: this.md.push("```mermaid", ...this.bb); this.bb.length = 0; break;
      case S_CHART: this.md.push("```chart", ...this.bb); this.bb.length = 0; break;
      case S_HTML: this.md.push("```html", ...this.bb); this.bb.length = 0; break;
      case S_LATEXF: this.md.push("```latex", ...this.bb); this.bb.length = 0; break;
      case S_LATEXD: this.md.push("$$", ...this.bb); this.bb.length = 0; break;
      case S_LATEXB: this.md.push("\\[", ...this.bb); this.bb.length = 0; break;
    }
    this.s = S_MD;
    this.flush();
    return this.B;
  }

  private flush(): void {
    if (!this.md.length) return;
    const c = this.md.join("\n"); this.md.length = 0;
    if (c.trim()) this.B.push({ type: "markdown", content: c });
  }

  private emit(t: string): void {
    this.flush();
    if (!this.bb.length) return;
    const c = this.bb.join("\n"); this.bb.length = 0;
    if (c.trim()) this.B.push({ type: t, content: c });
  }

  private line(l: string): void {
    let i = 0;
    while (i < l.length && ws(l.charCodeAt(i))) i++;
    const e = l.length;

    if (this.s === S_CODE || this.s === S_MERMAID || this.s === S_LATEXF || this.s === S_CHART || this.s === S_HTML) {
      const fv = fence(l, i, e);
      if (fv >= 1) {
        if (this.s === S_CODE) {
          this.flush();
          this.B.push({ type: "code", content: "```" + this.cl + "\n" + this.bb.join("\n") + "\n```" });
          this.bb.length = 0;
        } else { this.emit(this.s === S_MERMAID ? "mermaid" : this.s === S_CHART ? "chart" : this.s === S_HTML ? "html" : "latex"); }
        this.s = S_MD;
        if (fv === 2) {
          let j = i + 3;
          while (j < e && ws(l.charCodeAt(j))) j++;
          if (j < e) this.md.push(l.slice(j));
        }
      } else { this.bb.push(l); }
      return;
    }

    if (this.s === S_LATEXD) {
      if (dollar(l, i, e)) { this.emit("latex"); this.s = S_MD; } else { this.bb.push(l); }
      return;
    }

    if (this.s === S_LATEXB) {
      if (bracketClose(l, i, e)) { this.emit("latex"); this.s = S_MD; } else { this.bb.push(l); }
      return;
    }

    if (this.s === S_LATEXE) {
      this.ed = Math.max(0, this.ed + envDelta(l, i, e));
      this.bb.push(l.slice(i, e));
      if (this.ed === 0) { this.emit("latex"); this.s = S_MD; }
      return;
    }

    if (this.s === S_TABLE) {
      if (pipeRow(l, i, e)) { this.bb.push(l); } else { this.emit("table"); this.s = S_MD; this.line(l); }
      return;
    }

    if (this.s === S_TMAYBE) {
      if (sepRow(l, i, e)) { this.flush(); this.bb.push(this.hr, l); this.hr = ""; this.s = S_TABLE; }
      else { this.md.push(this.hr); this.hr = ""; this.s = S_MD; this.line(l); }
      return;
    }

    const f = fence(l, i, e);
    if (f === 2) {
      const lg = lang(l, i, e);
      this.flush();
      if (lg === "mermaid") this.s = S_MERMAID;
      else if (lg === "chart" || lg === "echart") this.s = S_CHART;
      else if (lg === "html") this.s = S_HTML;
      else if (lg === "latex") this.s = S_LATEXF;
      else { this.cl = lg; this.s = S_CODE; }
      return;
    }
    if (f === 1) { this.flush(); this.cl = ""; this.s = S_CODE; return; }
    if (dollar(l, i, e)) { this.flush(); this.s = S_LATEXD; return; }
    if (bracketOpen(l, i, e)) {
      this.flush();
      if (bracketClose(l, i, e)) {
        const inner = l.slice(i + 2, l.lastIndexOf("\\]")).trim();
        if (inner) this.B.push({ type: "latex", content: inner });
        this.s = S_MD;
      } else {
        this.s = S_LATEXB;
      }
      return;
    }
    if (beginEnv(l, i, e)) {
      this.flush();
      this.ed = Math.max(0, envDelta(l, i, e));
      this.bb.push(l.slice(i, e));
      if (this.ed === 0) this.emit("latex"); else this.s = S_LATEXE;
      return;
    }
    if (pipeRow(l, i, e)) { this.hr = l; this.s = S_TMAYBE; return; }
    this.md.push(l);
  }
}

export function tokenize(content: string): ContentBlock[] {
  const lex = new MarkdownLexer();
  lex.push(content);
  return lex.finalize();
}

export function tokenizeStream(content: string): { blocks: ContentBlock[]; pending: string } {
  if (!content) return { blocks: [], pending: "" };
  const lex = new MarkdownLexer();
  lex.push(content);
  return lex.drain();
}
