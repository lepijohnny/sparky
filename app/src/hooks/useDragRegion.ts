import { useCallback, useRef } from "react";

const isMac = navigator.userAgent.includes("Macintosh");

let prevRect: { x: number; y: number; w: number; h: number } | null = null;
let pseudoMaximized = false;
let animating = false;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

async function togglePseudoMaximize() {
  if (animating) return;

  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const { currentMonitor, primaryMonitor } = await import("@tauri-apps/api/window");
  const { PhysicalPosition, PhysicalSize } = await import("@tauri-apps/api/dpi");

  const win = getCurrentWindow();
  const monitor = (await currentMonitor()) ?? (await primaryMonitor());
  if (!monitor) return;

  const pos = await win.outerPosition();
  const size = await win.outerSize();
  const currentRect = { x: pos.x, y: pos.y, w: size.width, h: size.height };

  let targetRect: typeof currentRect;

  if (!pseudoMaximized) {
    prevRect = currentRect;
    const wa = monitor.size;
    const wp = monitor.position;
    targetRect = { x: wp.x, y: wp.y, w: wa.width, h: wa.height };
    pseudoMaximized = true;
  } else {
    targetRect = prevRect ?? currentRect;
    prevRect = null;
    pseudoMaximized = false;
  }

  animating = true;
  const duration = 300;
  const start = performance.now();

  await new Promise<void>((resolve) => {
    function step(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      const e = easeOutCubic(t);

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
