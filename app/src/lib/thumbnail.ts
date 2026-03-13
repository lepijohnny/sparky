const THUMB_WIDTH = 200;
const THUMB_QUALITY = 0.7;

const TEXT_TYPES = ["text/plain", "text/markdown", "text/csv", "text/x-markdown"];
const TEXT_EXTENSIONS = [".txt", ".md", ".csv", ".json", ".ts", ".js", ".py", ".sh"];

export async function generateThumbnail(file: File): Promise<Blob | null> {
  if (file.type.startsWith("image/")) return imageThumb(file);
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return pdfThumb(file);
  }
  if (TEXT_TYPES.includes(file.type) || TEXT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
    return textThumb(file);
  }
  return null;
}

function imageThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      const width = Math.min(THUMB_WIDTH, img.width);
      const scale = width / img.width;
      const height = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(objectUrl); resolve(null); return; }

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => { URL.revokeObjectURL(objectUrl); resolve(blob); },
        "image/jpeg",
        THUMB_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(null);
    };
    img.src = objectUrl;
  });
}

let pdfjsReady: typeof import("pdfjs-dist") | null = null;

async function getPdfjs() {
  if (pdfjsReady) return pdfjsReady;
  const lib = await import("pdfjs-dist");
  lib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  pdfjsReady = lib;
  return lib;
}

async function pdfThumb(file: File): Promise<Blob | null> {
  const pdfjsLib = await getPdfjs();

  const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  let pdf: Awaited<typeof loadingTask.promise> | null = null;
  try {
    pdf = await loadingTask.promise;
    const page = await pdf.getPage(1);

    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = THUMB_WIDTH / unscaledViewport.width;
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", THUMB_QUALITY);
    });
  } catch {
    return null;
  } finally {
    pdf?.destroy();
    loadingTask.destroy();
  }
}

async function textThumb(file: File): Promise<Blob | null> {
  const raw = await file.slice(0, 2000).text();
  const lines = raw.replace(/\t/g, "  ").split("\n").slice(0, 20);

  const width = THUMB_WIDTH;
  const height = Math.round(width * 1.4);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#f8f8f8";
  ctx.fillRect(0, 0, width, height);

  ctx.font = "9px ui-monospace, monospace";
  ctx.fillStyle = "#333333";
  const lineHeight = 12;
  const pad = 8;

  for (let i = 0; i < lines.length; i++) {
    const y = pad + (i + 1) * lineHeight;
    if (y > height - pad) break;
    ctx.fillText(lines[i].slice(0, 60), pad, y);
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", THUMB_QUALITY);
  });
}
