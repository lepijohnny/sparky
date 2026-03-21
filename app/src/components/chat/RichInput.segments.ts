export type Segment =
  | { type: "text"; value: string }
  | { type: "svc"; value: string }
  | { type: "label"; value: string; color: string }
  | { type: "paste"; id: string; lines: number };

export interface Cursor { seg: number; offset: number }

export interface Model {
  segments: Segment[];
  cursor: Cursor;
}

export const pasteStore = new Map<string, string>();
let pasteIdCounter = 0;
export function nextPasteId(): string { return `paste-${++pasteIdCounter}`; }

export function mkModel(text = ""): Model {
  return { segments: [{ type: "text", value: text }], cursor: { seg: 0, offset: text.length } };
}

export function normalize(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    if (s.type === "text") {
      const last = out[out.length - 1];
      if (last?.type === "text") last.value += s.value;
      else out.push({ ...s });
    } else {
      if (!out.length || out[out.length - 1].type !== "text") out.push({ type: "text", value: "" });
      out.push(s);
    }
  }
  if (!out.length || out[out.length - 1].type !== "text") out.push({ type: "text", value: "" });
  return out;
}

export function serialize(segs: Segment[]): string {
  let t = "";
  for (const s of segs) {
    if (s.type === "text") t += s.value;
    else if (s.type === "svc") t += `@${s.value}`;
    else if (s.type === "paste") t += pasteStore.get(s.id) ?? "";
  }
  return t.trim();
}

export function empty(segs: Segment[]): boolean {
  return segs.every((s) => s.type === "text" && s.value.trim() === "");
}

export function isText(s: Segment): s is { type: "text"; value: string } {
  return s.type === "text";
}
