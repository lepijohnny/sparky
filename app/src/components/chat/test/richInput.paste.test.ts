import { describe, test, expect } from "vitest";
import { mkModel, normalize, isText, type Segment, type Model, type Cursor } from "../RichInput.segments";

/**
 * Model-level delete of a selection range, matching the logic in
 * RichInput's deleteSelectionRange + insertText for paste.
 */
function deleteRange(m: Model, start: Cursor, end: Cursor): void {
  const { segments: segs } = m;
  if (start.seg > end.seg || (start.seg === end.seg && start.offset > end.offset)) {
    [start, end] = [end, start];
  }
  if (start.seg === end.seg) {
    const s = segs[start.seg] as { type: "text"; value: string };
    s.value = s.value.slice(0, start.offset) + s.value.slice(end.offset);
  } else {
    const ss = segs[start.seg] as { type: "text"; value: string };
    const se = segs[end.seg] as { type: "text"; value: string };
    ss.value = ss.value.slice(0, start.offset) + se.value.slice(end.offset);
    segs.splice(start.seg + 1, end.seg - start.seg);
    m.segments = normalize(segs);
  }
  m.cursor = { seg: start.seg, offset: start.offset };
}

function insertText(m: Model, text: string): void {
  const s = m.segments[m.cursor.seg];
  if (!isText(s)) return;
  s.value = s.value.slice(0, m.cursor.offset) + text + s.value.slice(m.cursor.offset);
  m.cursor = { seg: m.cursor.seg, offset: m.cursor.offset + text.length };
}

function pasteReplace(m: Model, start: Cursor, end: Cursor, text: string): void {
  deleteRange(m, start, end);
  insertText(m, text);
}

function textOf(m: Model): string {
  return m.segments.filter(isText).map((s) => s.value).join("");
}

describe("paste with selection replacement", () => {
  test("given 'this is test', when 'is test' selected and 'hello' pasted, then result is 'this hello'", () => {
    const m = mkModel("this is test");
    pasteReplace(m, { seg: 0, offset: 5 }, { seg: 0, offset: 12 }, "hello");
    expect(textOf(m)).toBe("this hello");
    expect(m.cursor).toEqual({ seg: 0, offset: 10 });
  });

  test("given 'this is test', when 'is test' selected and 'this is test' pasted, then result is 'this this is test'", () => {
    const m = mkModel("this is test");
    pasteReplace(m, { seg: 0, offset: 5 }, { seg: 0, offset: 12 }, "this is test");
    expect(textOf(m)).toBe("this this is test");
  });

  test("given 'abcdef', when 'cd' selected and 'XY' pasted, then result is 'abXYef'", () => {
    const m = mkModel("abcdef");
    pasteReplace(m, { seg: 0, offset: 2 }, { seg: 0, offset: 4 }, "XY");
    expect(textOf(m)).toBe("abXYef");
    expect(m.cursor).toEqual({ seg: 0, offset: 4 });
  });

  test("given 'hello world', when all selected and 'new' pasted, then result is 'new'", () => {
    const m = mkModel("hello world");
    pasteReplace(m, { seg: 0, offset: 0 }, { seg: 0, offset: 11 }, "new");
    expect(textOf(m)).toBe("new");
    expect(m.cursor).toEqual({ seg: 0, offset: 3 });
  });

  test("given 'hello world', when nothing selected (collapsed), then paste inserts at cursor", () => {
    const m = mkModel("hello world");
    m.cursor = { seg: 0, offset: 5 };
    insertText(m, " beautiful");
    expect(textOf(m)).toBe("hello beautiful world");
  });

  test("given reversed selection (end before start), when pasting, then still replaces correctly", () => {
    const m = mkModel("abcdef");
    pasteReplace(m, { seg: 0, offset: 4 }, { seg: 0, offset: 2 }, "XY");
    expect(textOf(m)).toBe("abXYef");
  });

  test("given selection at start, when pasting, then replaces beginning", () => {
    const m = mkModel("hello world");
    pasteReplace(m, { seg: 0, offset: 0 }, { seg: 0, offset: 5 }, "hi");
    expect(textOf(m)).toBe("hi world");
  });

  test("given selection at end, when pasting, then replaces end", () => {
    const m = mkModel("hello world");
    pasteReplace(m, { seg: 0, offset: 6 }, { seg: 0, offset: 11 }, "earth");
    expect(textOf(m)).toBe("hello earth");
  });

  test("given 'hello world', when 'world' selected and cut, then result is 'hello '", () => {
    const m = mkModel("hello world");
    deleteRange(m, { seg: 0, offset: 6 }, { seg: 0, offset: 11 });
    expect(textOf(m)).toBe("hello ");
    expect(m.cursor).toEqual({ seg: 0, offset: 6 });
  });

  test("given 'abcdef', when all selected and cut, then result is empty", () => {
    const m = mkModel("abcdef");
    deleteRange(m, { seg: 0, offset: 0 }, { seg: 0, offset: 6 });
    expect(textOf(m)).toBe("");
    expect(m.cursor).toEqual({ seg: 0, offset: 0 });
  });

  test("given 'hello world', when 'lo wo' selected and cut, then result is 'helrld'", () => {
    const m = mkModel("hello world");
    deleteRange(m, { seg: 0, offset: 3 }, { seg: 0, offset: 8 });
    expect(textOf(m)).toBe("helrld");
    expect(m.cursor).toEqual({ seg: 0, offset: 3 });
  });

  test("given multi-segment model, when selection spans chip, then deletes across segments", () => {
    const segs: Segment[] = [
      { type: "text", value: "before " },
      { type: "svc", value: "github" },
      { type: "text", value: " after" },
    ];
    const m: Model = { segments: normalize(segs), cursor: { seg: 0, offset: 0 } };
    deleteRange(m, { seg: 0, offset: 4 }, { seg: 2, offset: 3 });
    expect(textOf(m)).toBe("befoter");
    expect(m.cursor).toEqual({ seg: 0, offset: 4 });
  });
});
