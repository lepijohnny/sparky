import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { StorageProvider } from "../storage";
import type { SandboxImage } from "./sandbox.types";

const IMAGES_REL = "sandbox/images";

interface ImageManifest {
  name: string;
  description?: string;
  tools?: string[];
}

/**
 * Scan ~/.sparky/sandbox/images/ for installed images.
 * Each subdirectory must have a manifest.json.
 */
export function listSandboxImages(storage: StorageProvider): SandboxImage[] {
  const imagesDir = storage.root(IMAGES_REL);

  if (!existsSync(imagesDir)) return [];

  const images: SandboxImage[] = [];

  try {
    const entries = readdirSync(imagesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dir = join(imagesDir, entry.name);
      const manifestPath = join(dir, "manifest.json");

      if (!existsSync(manifestPath)) continue;

      try {
        const content = JSON.parse(readFileSync(manifestPath, "utf-8")) as ImageManifest;

        // Calculate directory size
        let size = 0;
        try {
          const files = readdirSync(dir);
          for (const f of files) {
            try { size += statSync(join(dir, f)).size; } catch {}
          }
        } catch {}

        images.push({
          id: entry.name,
          name: content.name ?? entry.name,
          description: content.description,
          tools: content.tools ?? [],
          size,
          path: dir,
        });
      } catch {
        // Invalid manifest — skip
      }
    }
  } catch {}

  return images;
}
