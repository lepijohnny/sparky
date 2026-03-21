import { readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { homedir } from "node:os";
import type { EventBus } from "./bus";

export function registerFsComplete(bus: EventBus) {
  const home = homedir();

  bus.on("fs.complete", (data) => {
    let dir: string;
    let prefix: string;

    if (data.partial.endsWith("/")) {
      let raw = data.partial;
      if (raw.startsWith("~/")) raw = resolve(home, raw.slice(2));
      else if (raw.startsWith("./")) raw = resolve(process.cwd(), raw.slice(2));
      else raw = resolve(raw);
      dir = raw;
      prefix = "";
    } else {
      const lastSlash = data.partial.lastIndexOf("/");
      prefix = lastSlash >= 0 ? data.partial.slice(lastSlash + 1) : data.partial;
      let dirPart = lastSlash >= 0 ? data.partial.slice(0, lastSlash + 1) : "./";
      if (dirPart.startsWith("~/")) dirPart = resolve(home, dirPart.slice(2));
      else if (dirPart.startsWith("./")) dirPart = resolve(process.cwd(), dirPart.slice(2));
      else dirPart = resolve(dirPart);
      dir = dirPart;
    }

    try {
      const showHidden = prefix.startsWith(".");
      const entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => (showHidden || !e.name.startsWith(".")) && e.name !== "node_modules" && e.name.toLowerCase().startsWith(prefix.toLowerCase()))
        .slice(0, 100)
        .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
        .sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1));

      let base = data.partial;
      if (base.endsWith("/")) { /* already at dir boundary */ }
      else {
        const lastSlash = base.lastIndexOf("/");
        base = lastSlash >= 0 ? base.slice(0, lastSlash + 1) : "";
      }

      return { entries, base };
    } catch {
      return { entries: [], base: data.partial };
    }
  });
}
