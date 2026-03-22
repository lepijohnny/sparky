import { useCallback, useRef } from "react";

const isMac = navigator.userAgent.includes("Macintosh");

let winApi: typeof import("@tauri-apps/api/window") | null = null;
let dpiApi: typeof import("@tauri-apps/api/dpi") | null = null;

if (isMac && window.__TAURI_INTERNALS__) {
  import("@tauri-apps/api/window").then((m) => { winApi = m; });
  import("@tauri-apps/api/dpi").then((m) => { dpiApi = m; });
}

let prevRect: { x: number; y: number; w: number; h: number } | null = null;
let pseudoMaximized = false;
let animating = false;
let cachedRect: { x: number; y: number; w: number; h: number } | null = null;
let cachedTarget: { x: number; y: number; w: number; h: number } | null = null;

function ease(t: number) {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

async function prefetchState() {
  if (!winApi) winApi = await import("@tauri-apps/api/window");
  const win = winApi.getCurrentWindow();
  const [pos, size, monitor] = await Promise.all([
    win.outerPosition(),
    win.outerSize(),
    winApi.currentMonitor(),
  ]);
  cachedRect = { x: pos.x, y: pos.y, w: size.width, h: size.height };
  if (monitor) {
    const wp = monitor.position;
    const wa = monitor.size;
    cachedTarget = { x: wp.x, y: wp.y, w: wa.width, h: wa.height };
  }
}

async function togglePseudoMaximize() {
  if (animating) return;

  if (!winApi) winApi = await import("@tauri-apps/api/window");
  if (!dpiApi) dpiApi = await import("@tauri-apps/api/dpi");

  const { getCurrentWindow } = winApi;
  const { PhysicalPosition, PhysicalSize } = dpiApi;
  const win = getCurrentWindow();

  const currentRect = cachedRect ?? (() => {
    const r = { x: 0, y: 0, w: 800, h: 600 };
    win.outerPosition().then(p => { r.x = p.x; r.y = p.y; });
    win.outerSize().then(s => { r.w = s.width; r.h = s.height; });
    return r;
  })();

  let targetRect: typeof currentRect;

  if (!pseudoMaximized) {
    prevRect = { ...currentRect };
    if (cachedTarget) {
      targetRect = cachedTarget;
    } else {
      const monitor = (await winApi.currentMonitor()) ?? (await winApi.primaryMonitor());
      if (!monitor) return;
      const wp = monitor.position;
      const wa = monitor.size;
      targetRect = { x: wp.x, y: wp.y, w: wa.width, h: wa.height };
    }
    pseudoMaximized = true;
  } else {
    targetRect = prevRect ?? currentRect;
    prevRect = null;
    pseudoMaximized = false;
  }

  cachedRect = null;
  cachedTarget = null;

  animating = true;
  const duration = 650;
  const start = performance.now();

  await new Promise<void>((resolve) => {
    function step(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const e = ease(t);

      const x = Math.round(currentRect.x + (targetRect.x - currentRect.x) * e);
      const y = Math.round(currentRect.y + (targetRect.y - currentRect.y) * e);
      const w = Math.round(currentRect.w + (targetRect.w - currentRect.w) * e);
      const h = Math.round(currentRect.h + (targetRect.h - currentRect.h) * e);

      win.setPosition(new PhysicalPosition(x, y));
      win.setSize(new PhysicalSize(w, h));

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        animating = false;
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

if (isMac && window.__TAURI_INTERNALS__) {
  import("@tauri-apps/api/window").then(({ getCurrentWindow }) => {
    const win = getCurrentWindow();
    win.onResized(() => {
      if (animating) return;
      win.isMaximized().then((maximized) => {
        if (maximized && !pseudoMaximized) {
          win.unmaximize().then(() => togglePseudoMaximize());
        }
      });
    });
  });
}

export function useDragRegion(): Record<string, unknown> {
  const lastClick = useRef({ time: 0, x: 0, y: 0 });
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement;
    if (el.closest("button, input, select, textarea, a, [data-no-drag]")) return;

    e.preventDefault();
    const now = Date.now();
    const prev = lastClick.current;
    if (now - prev.time < 300 && Math.abs(e.clientX - prev.x) < 5 && Math.abs(e.clientY - prev.y) < 5) {
      if (dragTimer.current) { clearTimeout(dragTimer.current); dragTimer.current = null; }
      togglePseudoMaximize();
      lastClick.current = { time: 0, x: 0, y: 0 };
    } else {
      lastClick.current = { time: now, x: e.clientX, y: e.clientY };
      prefetchState();
      dragTimer.current = setTimeout(() => {
        import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().startDragging());
        dragTimer.current = null;
      }, 200);
    }
  }, []);

  if (isMac) {
    return { onMouseDown };
  }
  return { "data-tauri-drag-region": true };
}
