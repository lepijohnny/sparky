import { memo, useCallback, useImperativeHandle, useRef, forwardRef, useState, useEffect } from "react";
import styles from "./RichInput.module.css";

const pasteStore = new Map<string, string>();
let pasteIdCounter = 0;

export type Segment =
  | { type: "text"; value: string }
  | { type: "svc"; value: string }
  | { type: "label"; value: string; color: string }
  | { type: "paste"; id: string; lines: number };

interface Cursor { seg: number; offset: number }

export interface RichInputHandle {
  focus: () => void;
  clear: () => void;
  getText: () => string;
  setText: (text: string) => void;
  isEmpty: () => boolean;
  insertSvcChip: (name: string) => void;
  insertLabelChip: (name: string, color: string) => void;
  dismissTrigger: () => void;
  clearTriggerText: () => void;
}

export interface TriggerInfo {
  type: "@" | "#";
  filter: string;
  position: { x: number; y: number };
}

interface RichInputProps {
  placeholder?: string;
  onSend: () => void;
  onChange: () => void;
  onTrigger: (info: TriggerInfo | null) => void;
}

interface Model {
  segments: Segment[];
  cursor: Cursor;
}

function mkModel(text = ""): Model {
  return { segments: [{ type: "text", value: text }], cursor: { seg: 0, offset: text.length } };
}

function normalize(segs: Segment[]): Segment[] {
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

function serialize(segs: Segment[]): string {
  let t = "";
  for (const s of segs) {
    if (s.type === "text") t += s.value;
    else if (s.type === "svc") t += `@${s.value}`;
    else if (s.type === "paste") t += pasteStore.get(s.id) ?? "";
  }
  return t.trim();
}

function empty(segs: Segment[]): boolean {
  return segs.every((s) => s.type === "text" && s.value.trim() === "");
}

export default memo(forwardRef<RichInputHandle, RichInputProps>(function RichInput(
  { placeholder = "Type a message...", onSend, onChange, onTrigger },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null);
  const model = useRef<Model>(mkModel());
  const triggerActive = useRef(false);
  const [ver, bump] = useState(0);
  const [preview, setPreview] = useState<{ text: string; x: number; y: number } | null>(null);

  const curSeg = () => model.current.segments[model.current.cursor.seg];
  const isText = (s: Segment): s is { type: "text"; value: string } => s.type === "text";

  const render = useCallback(() => {
    bump((n) => n + 1);
    const el = divRef.current;
    if (!el) return;
    const { segments: segs, cursor: cur } = model.current;

    el.innerHTML = "";
    let targetNode: Node | null = null;
    let targetOff = 0;

    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (s.type === "text") {
        const parts = s.value.split("\n");
        for (let p = 0; p < parts.length; p++) {
          if (p > 0) el.appendChild(document.createElement("br"));
          const tn = document.createTextNode(parts[p] || (segs.length === 1 && s.value === "" ? "" : "\u200B"));
          el.appendChild(tn);
          if (i === cur.seg) {
            let consumed = 0;
            for (let k = 0; k < p; k++) consumed += parts[k].length + 1;
            const localOff = cur.offset - consumed;
            if (localOff >= 0 && localOff <= parts[p].length) {
              targetNode = tn;
              targetOff = localOff;
            }
          }
        }
      } else {
        const chip = document.createElement("span");
        chip.contentEditable = "false";
        chip.className = styles.chip;
        if (s.type === "svc") {
          chip.dataset.chip = "svc";
          chip.classList.add(styles.chipSvc);
          chip.textContent = `@${s.value}`;
        } else if (s.type === "label") {
          chip.dataset.chip = "label";
          chip.classList.add(styles.chipLabel);
          const dot = document.createElement("span");
          dot.className = styles.chipLabelDot;
          dot.style.background = s.color;
          chip.appendChild(dot);
          chip.appendChild(document.createTextNode(`#${s.value}`));
        } else if (s.type === "paste") {
          chip.dataset.chip = "paste";
          chip.dataset.pasteId = s.id;
          chip.classList.add(styles.chipPaste);
          chip.textContent = `[paste ${s.lines} lines]`;
        }
        el.appendChild(chip);
      }
    }

    if (!targetNode && segs.length > 0) {
      const lastText = el.lastChild;
      if (lastText) {
        targetNode = lastText;
        targetOff = lastText.textContent?.length ?? 0;
      }
    }

    if (targetNode) {
      try {
        const r = document.createRange();
        const max = targetNode.textContent?.length ?? 0;
        r.setStart(targetNode, Math.min(targetOff, max));
        r.collapse(true);
        const s = window.getSelection();
        if (s) { s.removeAllRanges(); s.addRange(r); }
      } catch { /* */ }
    }
  }, []);

  const closeTrigger = useCallback(() => {
    triggerActive.current = false;
    onTrigger(null);
  }, [onTrigger]);

  const detectTrigger = useCallback(() => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (!isText(s)) { closeTrigger(); return; }

    const text = s.value;
    const pos = cur.offset;
    let tPos = -1;
    let tChar: "@" | "#" | null = null;

    for (let i = pos - 1; i >= 0; i--) {
      const c = text[i];
      if (c === " " || c === "\n") break;
      if (c === "@" || c === "#") {
        if (i === 0 || text[i - 1] === " " || text[i - 1] === "\n") {
          tPos = i; tChar = c as "@" | "#";
        }
        break;
      }
    }

    if (!tChar || tPos < 0) { closeTrigger(); return; }
    const filter = text.slice(tPos + 1, pos);
    if (filter.includes(" ")) { closeTrigger(); return; }

    triggerActive.current = true;
    const sel = window.getSelection();
    let x = 0, y = 0;
    if (sel?.rangeCount) {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      x = rect.left; y = rect.top;
    }
    onTrigger({ type: tChar, filter, position: { x, y } });
  }, [onTrigger, closeTrigger]);

  const insertChip = useCallback((chip: Segment) => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (!isText(s)) return;

    const tChar = chip.type === "svc" ? "@" : "#";
    let tStart = cur.offset;
    for (let i = cur.offset - 1; i >= 0; i--) {
      if (s.value[i] === tChar) { tStart = i; break; }
    }

    const before: Segment = { type: "text", value: s.value.slice(0, tStart) };
    const after: Segment = { type: "text", value: " " + s.value.slice(cur.offset) };
    const built = [
      ...segs.slice(0, cur.seg),
      before, chip, after,
      ...segs.slice(cur.seg + 1),
    ];
    const norm = normalize(built);
    const ci = norm.indexOf(chip);
    model.current = { segments: norm, cursor: { seg: ci + 1, offset: 1 } };
    closeTrigger();
    render();
    onChange();
  }, [closeTrigger, render, onChange]);

  useImperativeHandle(ref, () => ({
    focus() { divRef.current?.focus(); render(); },
    clear() {
      for (const s of model.current.segments) if (s.type === "paste") pasteStore.delete(s.id);
      model.current = mkModel();
      closeTrigger();
      render();
    },
    getText() { return serialize(model.current.segments); },
    setText(t: string) { model.current = mkModel(t); render(); },
    isEmpty() { return empty(model.current.segments); },
    insertSvcChip(name: string) { insertChip({ type: "svc", value: name }); },
    insertLabelChip(name: string, color: string) { insertChip({ type: "label", value: name, color }); },
    dismissTrigger() { closeTrigger(); },
    clearTriggerText() {
      const { segments: segs, cursor: cur } = model.current;
      const s = segs[cur.seg];
      if (!isText(s)) { closeTrigger(); return; }
      let tStart = cur.offset;
      for (let i = cur.offset - 1; i >= 0; i--) {
        if (s.value[i] === "#" || s.value[i] === "@") { tStart = i; break; }
      }
      s.value = s.value.slice(0, tStart) + s.value.slice(cur.offset);
      model.current.cursor = { seg: cur.seg, offset: tStart };
      closeTrigger();
      render();
    },
  }));

  const moveCursorLeft = useCallback(() => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (isText(s) && cur.offset > 0) {
      model.current.cursor = { seg: cur.seg, offset: cur.offset - 1 };
    } else if (cur.seg >= 2) {
      const prev = segs[cur.seg - 2];
      if (isText(prev)) model.current.cursor = { seg: cur.seg - 2, offset: prev.value.length };
    }
    render();
  }, [render]);

  const moveCursorRight = useCallback(() => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (isText(s) && cur.offset < s.value.length) {
      model.current.cursor = { seg: cur.seg, offset: cur.offset + 1 };
    } else if (cur.seg + 2 < segs.length) {
      model.current.cursor = { seg: cur.seg + 2, offset: 0 };
    }
    render();
  }, [render]);

  const deleteBack = useCallback(() => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (!isText(s)) return;
    if (cur.offset > 0) {
      s.value = s.value.slice(0, cur.offset - 1) + s.value.slice(cur.offset);
      model.current.cursor = { seg: cur.seg, offset: cur.offset - 1 };
    } else if (cur.seg >= 2) {
      const chip = segs[cur.seg - 1];
      if (chip.type === "paste") pasteStore.delete(chip.id);
      const prev = segs[cur.seg - 2];
      if (isText(prev)) {
        const off = prev.value.length;
        prev.value += s.value;
        segs.splice(cur.seg - 1, 2);
        model.current.segments = normalize(segs);
        model.current.cursor = { seg: cur.seg - 2, offset: off };
      }
    }
    render();
    onChange();
  }, [render, onChange]);

  const deleteFwd = useCallback(() => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (!isText(s)) return;
    if (cur.offset < s.value.length) {
      s.value = s.value.slice(0, cur.offset) + s.value.slice(cur.offset + 1);
    } else if (cur.seg + 2 < segs.length) {
      const chip = segs[cur.seg + 1];
      if (chip.type === "paste") pasteStore.delete(chip.id);
      const next = segs[cur.seg + 2];
      if (isText(next)) {
        s.value += next.value;
        segs.splice(cur.seg + 1, 2);
        model.current.segments = normalize(segs);
      }
    }
    render();
    onChange();
  }, [render, onChange]);

  const insertText = useCallback((text: string) => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (!isText(s)) return;
    s.value = s.value.slice(0, cur.offset) + text + s.value.slice(cur.offset);
    model.current.cursor = { seg: cur.seg, offset: cur.offset + text.length };
    render();
    onChange();
    detectTrigger();
  }, [render, onChange, detectTrigger]);

  useEffect(() => {
    const el = divRef.current;
    if (!el) return;
    const handler = (e: InputEvent) => {
      e.preventDefault();
      switch (e.inputType) {
        case "insertText":
          if (e.data) insertText(e.data);
          break;
        case "insertParagraph":
        case "insertLineBreak":
          insertText("\n");
          break;
        case "deleteContentBackward":
          deleteBack();
          break;
        case "deleteContentForward":
          deleteFwd();
          break;
        case "deleteWordBackward": {
          const { segments: segs, cursor: cur } = model.current;
          const s = segs[cur.seg];
          if (isText(s) && cur.offset > 0) {
            let i = cur.offset - 1;
            while (i > 0 && s.value[i - 1] === " ") i--;
            while (i > 0 && s.value[i - 1] !== " ") i--;
            s.value = s.value.slice(0, i) + s.value.slice(cur.offset);
            model.current.cursor = { seg: cur.seg, offset: i };
            render();
            onChange();
          } else {
            deleteBack();
          }
          break;
        }
        case "deleteWordForward": {
          const { segments: segs, cursor: cur } = model.current;
          const s = segs[cur.seg];
          if (isText(s) && cur.offset < s.value.length) {
            let i = cur.offset;
            while (i < s.value.length && s.value[i] !== " ") i++;
            while (i < s.value.length && s.value[i] === " ") i++;
            s.value = s.value.slice(0, cur.offset) + s.value.slice(i);
            render();
            onChange();
          } else {
            deleteFwd();
          }
          break;
        }
      }
    };
    el.addEventListener("beforeinput", handler);
    return () => el.removeEventListener("beforeinput", handler);
  }, [insertText, deleteBack, deleteFwd, render, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (triggerActive.current) {
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(e.key)) return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }

    if (e.key === "ArrowLeft" && !e.shiftKey) {
      e.preventDefault();
      moveCursorLeft();
      return;
    }
    if (e.key === "ArrowRight" && !e.shiftKey) {
      e.preventDefault();
      moveCursorRight();
      return;
    }

    if (e.key === "Home") {
      e.preventDefault();
      model.current.cursor = { seg: 0, offset: 0 };
      render();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      const segs = model.current.segments;
      const last = segs[segs.length - 1];
      model.current.cursor = { seg: segs.length - 1, offset: isText(last) ? last.value.length : 0 };
      render();
      return;
    }
  }, [onSend, moveCursorLeft, moveCursorRight, render]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    const lines = text.split("\n");
    if (lines.length <= 3) {
      insertText(text);
      return;
    }

    const id = `paste-${++pasteIdCounter}`;
    pasteStore.set(id, text);
    const chip: Segment = { type: "paste", id, lines: lines.length };

    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (!isText(s)) return;

    const before: Segment = { type: "text", value: s.value.slice(0, cur.offset) };
    const after: Segment = { type: "text", value: " " + s.value.slice(cur.offset) };
    const built = [...segs.slice(0, cur.seg), before, chip, after, ...segs.slice(cur.seg + 1)];
    const norm = normalize(built);
    const ci = norm.indexOf(chip);
    model.current = { segments: norm, cursor: { seg: ci + 1, offset: 1 } };
    render();
    onChange();
  }, [insertText, render, onChange]);

  const handleChipHover = useCallback((e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest("[data-chip='paste']") as HTMLElement | null;
    if (!t) { setPreview(null); return; }
    const id = t.dataset.pasteId;
    if (!id) return;
    const text = pasteStore.get(id);
    if (!text) return;
    const rect = t.getBoundingClientRect();
    const lines = text.split("\n");
    const p = lines.length > 10 ? lines.slice(0, 10).join("\n") + `\n… (${lines.length - 10} more)` : text;
    setPreview({ text: p, x: rect.left, y: rect.top });
  }, []);

  const handleClick = useCallback(() => {
    const el = divRef.current;
    const sel = window.getSelection();
    if (!el || !sel?.rangeCount || !sel.isCollapsed) return;

    const node = sel.focusNode;
    if (!node) return;

    const children = Array.from(el.childNodes);
    const { segments: segs } = model.current;

    let domIdx = 0;
    let segIdx = 0;

    for (segIdx = 0; segIdx < segs.length; segIdx++) {
      const s = segs[segIdx];
      if (s.type === "text") {
        const parts = s.value.split("\n");
        for (let p = 0; p < parts.length; p++) {
          if (p > 0) domIdx++;
          const child = children[domIdx];
          if (child === node || child?.contains(node)) {
            let charOff = 0;
            for (let k = 0; k < p; k++) charOff += parts[k].length + 1;
            charOff += sel.focusOffset;
            if (s.value === "" && node.textContent === "\u200B") charOff = 0;
            model.current.cursor = { seg: segIdx, offset: Math.min(charOff, s.value.length) };
            detectTrigger();
            return;
          }
          domIdx++;
        }
      } else {
        if (children[domIdx] === node || children[domIdx]?.contains(node)) {
          if (segIdx + 1 < segs.length) {
            model.current.cursor = { seg: segIdx + 1, offset: 0 };
          }
          detectTrigger();
          return;
        }
        domIdx++;
      }
    }
  }, [detectTrigger]);

  useEffect(() => { render(); }, [render]);

  return (
    <div className={styles.wrapper}>
      <div
        ref={divRef}
        className={`${styles.editable} ${empty(model.current.segments) ? styles.empty : ""}`}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onClick={handleClick}
        onMouseOver={handleChipHover}
        onMouseLeave={() => setPreview(null)}
        role="textbox"
        aria-multiline="true"
      />
      {preview && (
        <div
          className={styles.pastePreview}
          style={{ left: preview.x, top: preview.y - 8, transform: "translateY(-100%)" }}
        >
          {preview.text}
        </div>
      )}
    </div>
  );
}));
