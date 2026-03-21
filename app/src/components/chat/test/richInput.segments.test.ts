import { describe, test, expect } from "vitest";
import { mkModel, normalize, serialize, empty, isText, pasteStore, nextPasteId, type Segment } from "../RichInput.segments";

describe("RichInput.segments", () => {
  describe("mkModel", () => {
    test("given no args, when creating model, then returns empty text segment with cursor at 0", () => {
      const m = mkModel();
      expect(m.segments).toEqual([{ type: "text", value: "" }]);
      expect(m.cursor).toEqual({ seg: 0, offset: 0 });
    });

    test("given text, when creating model, then cursor is at end", () => {
      const m = mkModel("hello");
      expect(m.segments).toEqual([{ type: "text", value: "hello" }]);
      expect(m.cursor).toEqual({ seg: 0, offset: 5 });
    });
  });

  describe("normalize", () => {
    test("given adjacent text segments, when normalizing, then merges them", () => {
      const segs: Segment[] = [
        { type: "text", value: "hello" },
        { type: "text", value: " world" },
      ];
      expect(normalize(segs)).toEqual([{ type: "text", value: "hello world" }]);
    });

    test("given chip without surrounding text, when normalizing, then adds empty text segments", () => {
      const segs: Segment[] = [{ type: "svc", value: "github" }];
      const result = normalize(segs);
      expect(result).toEqual([
        { type: "text", value: "" },
        { type: "svc", value: "github" },
        { type: "text", value: "" },
      ]);
    });

    test("given empty array, when normalizing, then returns single empty text", () => {
      expect(normalize([])).toEqual([{ type: "text", value: "" }]);
    });

    test("given text-chip-text, when normalizing, then keeps structure", () => {
      const segs: Segment[] = [
        { type: "text", value: "hi " },
        { type: "svc", value: "github" },
        { type: "text", value: " bye" },
      ];
      expect(normalize(segs)).toEqual(segs);
    });

    test("given adjacent chips, when normalizing, then inserts text between", () => {
      const segs: Segment[] = [
        { type: "svc", value: "a" },
        { type: "svc", value: "b" },
      ];
      const result = normalize(segs);
      expect(result[0]).toEqual({ type: "text", value: "" });
      expect(result[1]).toEqual({ type: "svc", value: "a" });
      expect(result[2]).toEqual({ type: "text", value: "" });
      expect(result[3]).toEqual({ type: "svc", value: "b" });
      expect(result[4]).toEqual({ type: "text", value: "" });
    });
  });

  describe("serialize", () => {
    test("given text only, when serializing, then returns trimmed text", () => {
      expect(serialize([{ type: "text", value: "  hello  " }])).toBe("hello");
    });

    test("given svc chip, when serializing, then prefixes with @", () => {
      const segs: Segment[] = [
        { type: "text", value: "use " },
        { type: "svc", value: "github" },
        { type: "text", value: "" },
      ];
      expect(serialize(segs)).toBe("use @github");
    });

    test("given paste chip, when serializing, then inlines stored content", () => {
      const id = nextPasteId();
      pasteStore.set(id, "line1\nline2\nline3");
      const segs: Segment[] = [
        { type: "text", value: "before " },
        { type: "paste", id, lines: 3 },
        { type: "text", value: " after" },
      ];
      expect(serialize(segs)).toBe("before line1\nline2\nline3 after");
      pasteStore.delete(id);
    });

    test("given label chip, when serializing, then excluded from text", () => {
      const segs: Segment[] = [
        { type: "text", value: "tag " },
        { type: "label", value: "bug", color: "red" },
        { type: "text", value: "" },
      ];
      expect(serialize(segs)).toBe("tag");
    });
  });

  describe("empty", () => {
    test("given empty text, when checking, then returns true", () => {
      expect(empty([{ type: "text", value: "" }])).toBe(true);
    });

    test("given whitespace only, when checking, then returns true", () => {
      expect(empty([{ type: "text", value: "   " }])).toBe(true);
    });

    test("given text content, when checking, then returns false", () => {
      expect(empty([{ type: "text", value: "hi" }])).toBe(false);
    });

    test("given chip present, when checking, then returns false", () => {
      expect(empty([
        { type: "text", value: "" },
        { type: "svc", value: "x" },
        { type: "text", value: "" },
      ])).toBe(false);
    });
  });

  describe("isText", () => {
    test("given text segment, when checking, then returns true", () => {
      expect(isText({ type: "text", value: "hi" })).toBe(true);
    });

    test("given svc segment, when checking, then returns false", () => {
      expect(isText({ type: "svc", value: "x" })).toBe(false);
    });
  });

  describe("nextPasteId", () => {
    test("given sequential calls, when generating ids, then returns unique values", () => {
      const a = nextPasteId();
      const b = nextPasteId();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^paste-\d+$/);
    });
  });
});
