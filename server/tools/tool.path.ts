import { resolve } from "node:path";
import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";

export function home(path: string, cwd?: string): string {
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    return resolve(homedir(), path.slice(2));
  }
  return cwd ? resolve(cwd, path) : resolve(path);
}

/** Resolve symlinks so trust rules match the real path. Returns the original path if it doesn't exist yet (e.g. new files). */
export function real(resolved: string): string {
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

/** Returns an error string if the path is not a readable file, or null if OK. */
export function requireFile(resolved: string, display: string): string | null {
  const stat = statSync(resolved, { throwIfNoEntry: false });
  if (!stat) return `Error: file not found "${display}"`;
  if (!stat.isFile()) return `Error: not a file "${display}"`;
  return null;
}

/** Returns an error string if the path is not a directory, or null if OK. */
export function requireDir(resolved: string, display: string): string | null {
  const stat = statSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) return `Error: directory not found "${display}"`;
  return null;
}

/** Returns an error string if the path is an existing directory (for write targets), or null if OK. */
export function rejectDir(resolved: string, display: string): string | null {
  const stat = statSync(resolved, { throwIfNoEntry: false });
  if (stat?.isDirectory()) return `Error: path is a directory "${display}"`;
  return null;
}

/** Returns an error string if the path does not exist, or null if OK. */
export function requirePath(resolved: string, display: string): string | null {
  const stat = statSync(resolved, { throwIfNoEntry: false });
  if (!stat) return `Error: path not found "${display}"`;
  return null;
}
