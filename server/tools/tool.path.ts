import { resolve } from "node:path";
import { homedir } from "node:os";

export function home(path: string): string {
  if (path === "~" || path.startsWith("~/") || path.startsWith("~\\")) {
    return resolve(homedir(), path.slice(2));
  }
  return resolve(path);
}
