import { memo, useCallback, useImperativeHandle, useRef, forwardRef, useState, useEffect } from "react";
import styles from "./RichInput.module.css";
import { type Segment, type Model, type Cursor, pasteStore, nextPasteId, mkModel, normalize, serialize, empty, isText } from "./RichInput.segments";

export type { Segment };

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
  replacePathToken: (replacement: string) => void;
  getPathToken: () => string | null;
}

export interface TriggerInfo {
  type: "@" | "#";
  filter: string;
  position: { x: number; y: number };
}

export interface PathCompleteRequest {
  partial: string;
  position: { x: number; y: number };
}

interface RichInputProps {
  placeholder?: string;
  onSend: () => void;
  onChange: () => void;
  onTrigger: (info: TriggerInfo | null) => void;
  onPathComplete?: (req: PathCompleteRequest) => void;
}

export default memo(forwardRef<RichInputHandle, RichInputProps>(function RichInput(
  { placeholder = "Type a message...", onSend, onChange, onTrigger, onPathComplete },
  ref,
) {
  const divRef = useRef<HTMLDivElement>(null);
  const model = useRef<Model>(mkModel());
  const triggerActive = useRef(false);
  const [ver, bump] = useState(0);
  const [preview, setPreview] = useState<{ text: string; x: number; y: number } | null>(null);

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

  const syncCursorFromDOM = useCallback(() => {
    const el = divRef.current;
    if (!el) return;
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return;

    const segs = model.current.segments;
    let node: Node | null = sel.anchorNode;
    let domOff = sel.anchorOffset;

    if (node === el) {
      const children = el.childNodes;
      if (domOff >= children.length) {
        node = children[children.length - 1] ?? null;
        domOff = node?.textContent?.length ?? 0;
      } else {
        node = children[domOff];
        domOff = 0;
      }
    }

    if (!node) return;

    let segIdx = 0;
    let charOff = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let current: Node | null = walker.firstChild();
    let textRunOffset = 0;

    while (current) {
      if (current.nodeType === Node.TEXT_NODE) {
        if (current === node || current === sel.anchorNode) {
          charOff = textRunOffset + domOff;
          break;
        }
        textRunOffset += current.textContent?.length ?? 0;
      } else if (current instanceof HTMLBRElement) {
        textRunOffset += 1;
      } else if (current instanceof HTMLElement && current.dataset.chip) {
        if (current === node || current.contains(sel.anchorNode)) {
          segIdx += 1;
          charOff = 0;
          break;
        }
        segIdx += 2;
        textRunOffset = 0;
      }
      current = walker.nextNode();
    }

    if (segIdx < segs.length) {
      model.current.cursor = { seg: segIdx, offset: charOff };
    }
  }, []);

  const closeTrigger = useCallback(() => {
    triggerActive.current = false;
    onTrigger(null);
  }, [onTrigger]);

  const getPathToken = useCallback((): string | null => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (!isText(s)) return null;
    const text = s.value;
    const pos = cur.offset;
    let start = pos;
    while (start > 0 && text[start - 1] !== " " && text[start - 1] !== "\n") start--;
    const token = text.slice(start, pos);
    if (token.startsWith("~/") || token.startsWith("./") || token.startsWith("/")) return token;
    return null;
  }, []);

  const replacePathToken = useCallback((replacement: string) => {
    const { segments: segs, cursor: cur } = model.current;
    const s = segs[cur.seg];
    if (!isText(s)) return;
    const text = s.value;
    const pos = cur.offset;
    let start = pos;
    while (start > 0 && text[start - 1] !== " " && text[start - 1] !== "\n") start--;
    s.value = text.slice(0, start) + replacement + text.slice(pos);
    model.current.cursor = { seg: cur.seg, offset: start + replacement.length };
    render();
    onChange();
  }, [render, onChange]);

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
    replacePathToken(replacement: string) { replacePathToken(replacement); },
    getPathToken() { return getPathToken(); },
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

  const resolveOffset = useCallback((node: Node, off: number): Cursor | null => {
    const el = divRef.current;
    if (!el) return null;

    let resolvedNode = node;
    let resolvedOff = off;
    if (node === el) {
      const children = el.childNodes;
      if (off >= children.length) {
        const segs = model.current.segments;
        const last = segs[segs.length - 1];
        return { seg: segs.length - 1, offset: isText(last) ? last.value.length : 0 };
      }
      resolvedNode = children[off];
      resolvedOff = 0;
    }

    const children = Array.from(el.childNodes);
    const { segments: segs } = model.current;
    let domIdx = 0;
    for (let segIdx = 0; segIdx < segs.length; segIdx++) {
      const s = segs[segIdx];
      if (s.type === "text") {
        const parts = s.value.split("\n");
        for (let p = 0; p < parts.length; p++) {
          if (p > 0) domIdx++;
          const child = children[domIdx];
          if (child === resolvedNode || child?.contains(resolvedNode)) {
            let charOff = 0;
            for (let k = 0; k < p; k++) charOff += parts[k].length + 1;
            charOff += resolvedOff;
            if (s.value === "" && resolvedNode.textContent === "\u200B") charOff = 0;
            return { seg: segIdx, offset: Math.min(charOff, s.value.length) };
          }
          domIdx++;
        }
      } else {
        domIdx++;
      }
    }
    return null;
  }, []);

  const deleteSelection = useCallback((): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;

    const el = divRef.current;
    if (!el) return false;

    const selText = sel.toString();
    const fullText = serialize(model.current.segments);
    if (selText.replace(/\u200B/g, "") === fullText || (sel.anchorNode === el || sel.focusNode === el)) {
      for (const s of model.current.segments) if (s.type === "paste") pasteStore.delete(s.id);
      model.current = mkModel();
      render();
      onChange();
      return true;
    }

    if (!sel.anchorNode || !sel.focusNode) return false;
    const a = resolveOffset(sel.anchorNode, sel.anchorOffset);
    const f = resolveOffset(sel.focusNode, sel.focusOffset);
    if (!a || !f) return false;

    const { segments: segs } = model.current;
    const sa = segs[a.seg], sf = segs[f.seg];
    if (!isText(sa) || !isText(sf)) return false;

    let start = a, end = f;
    if (a.seg > f.seg || (a.seg === f.seg && a.offset > f.offset)) { start = f; end = a; }

    if (start.seg === end.seg) {
      const s = segs[start.seg] as { type: "text"; value: string };
      s.value = s.value.slice(0, start.offset) + s.value.slice(end.offset);
      model.current.cursor = { seg: start.seg, offset: start.offset };
    } else {
      const ss = segs[start.seg] as { type: "text"; value: string };
      const se = segs[end.seg] as { type: "text"; value: string };
      ss.value = ss.value.slice(0, start.offset) + se.value.slice(end.offset);
      segs.splice(start.seg + 1, end.seg - start.seg);
      model.current.segments = normalize(segs);
      model.current.cursor = { seg: start.seg, offset: start.offset };
    }

    render();
    onChange();
    return true;
  }, [resolveOffset, render, onChange]);

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
          deleteSelection();
          if (e.data) insertText(e.data);
          break;
        case "insertParagraph":
        case "insertLineBreak":
          insertText("\n");
          break;
        case "deleteContentBackward":
          if (!deleteSelection()) deleteBack();
          detectTrigger();
          break;
        case "deleteContentForward":
          if (!deleteSelection()) deleteFwd();
          detectTrigger();
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
            detectTrigger();
          } else {
            deleteBack();
            detectTrigger();
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

    if (e.key === "Tab" && !e.shiftKey && onPathComplete) {
      const token = getPathToken();
      if (token) {
        e.preventDefault();
        const sel = window.getSelection();
        let x = 0, y = 0;
        if (sel?.rangeCount) {
          const rect = sel.getRangeAt(0).getBoundingClientRect();
          x = rect.left; y = rect.top;
        }
        onPathComplete({ partial: token, position: { x, y } });
        return;
      }
    }

    if (e.key === "a" && e.metaKey) {
      e.preventDefault();
      const el = divRef.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(range); }
      }
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }

    if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey) {
      requestAnimationFrame(syncCursorFromDOM);
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
  }, [onSend, moveCursorLeft, moveCursorRight, render, syncCursorFromDOM]);

  const deleteSelectionRange = useCallback((): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode) return false;

    const el = divRef.current;
    if (!el) return false;

    const selText = sel.toString().replace(/\u200B/g, "");
    const fullText = serialize(model.current.segments);
    if (selText === fullText || (sel.anchorNode === el || sel.focusNode === el)) {
      for (const s of model.current.segments) if (s.type === "paste") pasteStore.delete(s.id);
      model.current = mkModel();
      return true;
    }

    const a = resolveOffset(sel.anchorNode, sel.anchorOffset);
    const f = resolveOffset(sel.focusNode, sel.focusOffset);
    if (!a || !f) return false;

    const { segments: segs } = model.current;
    if (!isText(segs[a.seg]) || !isText(segs[f.seg])) return false;

    let start = a, end = f;
    if (a.seg > f.seg || (a.seg === f.seg && a.offset > f.offset)) { start = f; end = a; }

    if (start.seg === end.seg) {
      const s = segs[start.seg] as { type: "text"; value: string };
      s.value = s.value.slice(0, start.offset) + s.value.slice(end.offset);
    } else {
      const ss = segs[start.seg] as { type: "text"; value: string };
      const se = segs[end.seg] as { type: "text"; value: string };
      ss.value = ss.value.slice(0, start.offset) + se.value.slice(end.offset);
      segs.splice(start.seg + 1, end.seg - start.seg);
      model.current.segments = normalize(segs);
    }
    model.current.cursor = { seg: start.seg, offset: start.offset };
    return true;
  }, [resolveOffset, render, onChange]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;

    deleteSelectionRange();

    const lines = text.split("\n");
    if (lines.length <= 3) {
      insertText(text);
      return;
    }

    const id = nextPasteId();
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
  }, [deleteSelectionRange, insertText, render, onChange]);

  const handleCut = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    if (text) e.clipboardData.setData("text/plain", text);
    deleteSelectionRange();
    render();
    onChange();
  }, [deleteSelectionRange, render, onChange]);

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
        data-shortcut-input
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCut={handleCut}
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
