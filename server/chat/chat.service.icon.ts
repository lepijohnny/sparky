import { writeFile, mkdir } from "node:fs/promises";
import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

let _servicesDir = "";

export function initServiceIconDir(dir: string): void {
  _servicesDir = dir;
}

export async function downloadServiceIcon(serviceId: string, icon?: string, baseUrl?: string): Promise<void> {
  if (!baseUrl) return;
  const candidates: string[] = [];
  if (icon?.startsWith("http")) candidates.push(icon);
  try {
    const origin = new URL(baseUrl).origin;
    for (const path of ["/favicon.ico", "/favicon.png"]) {
      const url = `${origin}${path}`;
      if (!candidates.includes(url)) candidates.push(url);
    }
  } catch {}

  for (const url of candidates) {
    try {
      const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5_000) });
      if (res.ok && res.headers.get("content-type")?.startsWith("image")) {
        const mime = (res.headers.get("content-type") ?? "image/png").split(";")[0].trim();
        const buf = Buffer.from(await res.arrayBuffer());
        const dir = _servicesDir;
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, `${serviceId}.icon`), Buffer.concat([Buffer.from(`${mime}\n`), buf]));
        return;
      }
    } catch {}
  }
}

export function readIconDataUri(serviceId: string): string | undefined {
  try {
    const raw = readFileSync(join(_servicesDir, `${serviceId}.icon`));
    const nl = raw.indexOf(0x0a);
    if (nl < 0) return undefined;
    return `data:${raw.subarray(0, nl).toString("utf-8")};base64,${raw.subarray(nl + 1).toString("base64")}`;
  } catch {
    return undefined;
  }
}

export function deleteServiceIcon(serviceId: string): void {
  try { unlinkSync(join(_servicesDir, `${serviceId}.icon`)); } catch {}
}
