import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import type { QemuStatus } from "./sandbox.types";

/** Common binary directories that may not be in PATH when launched from a .app bundle. */
const EXTRA_PATHS = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"];

function findBinary(name: string): string | undefined {
  // Try which first
  try {
    const result = execSync(`which ${name}`, { stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
    if (result) return result;
  } catch { /* not found */ }

  for (const dir of EXTRA_PATHS) {
    const full = join(dir, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

/**
 * Detect QEMU installation. Returns status with install instructions per platform.
 */
export function checkQemu(): QemuStatus {
  const platform = process.platform === "darwin"
    ? "macos" as const
    : process.platform === "linux"
      ? "linux" as const
      : "unsupported" as const;

  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  const binary = `qemu-system-${arch}`;

  const installCommand = platform === "macos"
    ? "brew install qemu"
    : platform === "linux"
      ? `sudo apt install qemu-system-${arch === "aarch64" ? "arm" : "x86"}`
      : "";

  const path = findBinary(binary);

  let version: string | undefined;
  if (path) {
    try {
      const output = execSync(`"${path}" --version`, { stdio: ["pipe", "pipe", "pipe"] }).toString();
      const match = output.match(/QEMU emulator version ([\d.]+)/);
      version = match?.[1];
    } catch {}
  }

  return { installed: !!path, path, version, installCommand, platform };
}
