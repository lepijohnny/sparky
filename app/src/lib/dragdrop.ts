import type { PendingAttachment } from "../types/attachment";
import { generateThumbnail } from "./thumbnail";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml",
  txt: "text/plain", md: "text/markdown", csv: "text/csv", html: "text/html", json: "application/json",
  xml: "application/xml", zip: "application/zip",
};

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_MAP[ext] ?? "application/octet-stream";
}

type DropHandler = (files: PendingAttachment[]) => void;
type ToastHandler = (toast: { id: string; kind: "error"; title: string }) => void;
type DragOverHandler = (over: boolean) => void;

let registered = false;
let onDrop: DropHandler = () => {};
let onToast: ToastHandler = () => {};
let onDragOver: DragOverHandler = () => {};

export function setDropHandlers(drop: DropHandler, toast: ToastHandler, dragOver: DragOverHandler): void {
  onDrop = drop;
  onToast = toast;
  onDragOver = dragOver;
}

export async function initDragDrop(): Promise<void> {
  if (registered) return;
  registered = true;
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    const { stat, readFile } = await import("@tauri-apps/plugin-fs");
    await getCurrentWebview().onDragDropEvent(async (event) => {
      if (event.payload.type === "over" || event.payload.type === "enter") { onDragOver(true); return; }
      if (event.payload.type === "leave" || event.payload.type === "cancel") { onDragOver(false); return; }
      if (event.payload.type !== "drop") return;
      onDragOver(false);
      const paths = event.payload.paths;
      if (!paths || paths.length === 0) return;
      const files: PendingAttachment[] = [];
      for (const filePath of paths) {
        try {
          const meta = await stat(filePath);
          if (!meta.size || meta.size > MAX_FILE_SIZE) {
            if (meta.size && meta.size > MAX_FILE_SIZE) {
              const name = filePath.split("/").pop() ?? filePath;
              onToast({ id: `file-too-large-${Date.now()}`, kind: "error", title: `${name} exceeds 10 MB limit` });
            }
            continue;
          }
          const filename = filePath.split("/").pop() ?? filePath;
          const mimeType = guessMime(filename);
          const bytes = await readFile(filePath);
          const file = new File([bytes], filename, { type: mimeType });
          const thumb = await generateThumbnail(file);
          files.push({
            id: crypto.randomUUID(),
            filename,
            mimeType,
            size: meta.size,
            thumbnailUrl: thumb ? URL.createObjectURL(thumb) : null,
            filePath,
          });
        } catch {}
      }
      if (files.length > 0) onDrop(files);
    });
  } catch {}
}
