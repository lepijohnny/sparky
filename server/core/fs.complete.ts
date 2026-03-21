import { readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { homedir } from "node:os";
import type { EventBus } from "./bus";

export function registerFsComplete(bus: EventBus) {
  const home = homedir();

  bus.on("fs.complete", (data) => {
    let raw = data.partial;
    if (raw.startsWith("~/")) raw = resolve(home, raw.slice(2));
    else if (raw.startsWith("./")) raw = resolve(process.cwd(), raw.slice(2));
    else raw = resolve(raw);

    let dir: string;
    let prefix: string;

    try {
      const st = statSync(raw);
      if (st.isDirectory()) {
        dir = raw;
        prefix = "";
      } else {
        dir = dirname(raw);
        prefix = basename(raw);
      }
    } catch {
      dir = dirname(raw);
      prefix = basename(raw);
    }

    try {
      const entries = readdirSync(dir, { withFileTypes: true })
        .filter((e) => !e.name.startsWith(".") && e.name !== "node_modules" && e.name.toLowerCase().startsWith(prefix.toLowerCase()))
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
