import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "dist");
const serverNm = join(__dirname, "node_modules");

const NATIVE_EXTERNALS = [
  "better-sqlite3",
  "sqlite-vec",
  "node-llama-cpp",
  "fsevents",
];

/** Flat list of all native packages to copy into dist/node_modules/.
 *  Includes transitive deps — pnpm does not hoist them. */
const COPY_PACKAGES = [
  "better-sqlite3",
  "bindings",
  "file-uri-to-path",
  "sqlite-vec",
  "fsevents",
];

async function main() {
  if (existsSync(outDir)) rmSync(outDir, { recursive: true });
  mkdirSync(outDir, { recursive: true });

  const version = (await import("node:fs")).readFileSync(join(__dirname, "..", ".version"), "utf-8").trim();

  const commonOptions = {
    bundle: true,
    platform: "node" as const,
    format: "esm" as const,
    target: "node22",
    external: NATIVE_EXTERNALS,
    sourcemap: false,
    minify: false,
    define: { "SPARKY_VERSION": JSON.stringify(version) },
    banner: {
      js: `
import { createRequire } from "node:module";
import { fileURLToPath as __fileURLToPath } from "node:url";
import { dirname as __dirname_fn } from "node:path";
const require = createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_fn(__filename);
`.trim(),
    },
  };

  console.log("Bundling server...");
  await build({
    ...commonOptions,
    entryPoints: [join(__dirname, "index.ts")],
    outfile: join(outDir, "server.mjs"),
  });

  console.log("Bundling worker...");
  await build({
    ...commonOptions,
    entryPoints: [join(__dirname, "knowledge/worker/kt.worker.ts")],
    outfile: join(outDir, "kt.worker.mjs"),
  });

  console.log("Copying native modules...");
  mkdirSync(join(outDir, "node_modules"), { recursive: true });

  for (const pkg of COPY_PACKAGES) {
    copyPkg(pkg);
  }

  copySqliteVecPlatform();
  copyNodeLlamaCpp();

  console.log("Copying prompts...");
  cpSync(join(__dirname, "prompts"), join(outDir, "prompts"), { recursive: true });

  console.log("Cleaning unnecessary files...");
  pruneDistJunk(join(outDir, "node_modules"));

  const bundledSize = getDirectorySize(outDir);
  console.log(`\nDone! dist: ${(bundledSize / 1024 / 1024).toFixed(1)} MB`);
}

function copyPkg(name: string) {
  const dest = join(outDir, "node_modules", name);
  if (existsSync(dest)) return;

  const src = join(serverNm, name);
  if (!existsSync(src)) {
    console.log(`  skip ${name} (not on this platform)`);
    return;
  }
  cpSync(src, dest, { recursive: true, dereference: true });
  pruneNativePkg(dest);
  console.log(`  ${name}`);
}

/** Remove docs, readmes, licenses, changelogs, tests from all packages in node_modules. */
function pruneDistJunk(nmDir: string) {
  const junkPatterns = /^(readme|README|README\.md|readme\.md|LICENSE|LICENSE\.md|license|LICENCE|CHANGELOG|CHANGELOG\.md|HISTORY\.md|CHANGES\.md|\.npmignore|\.eslintrc|\.travis\.yml|\.github|test|tests|__tests__|example|examples|doc|docs|\.editorconfig|tsconfig\.json|\.DS_Store)$/i;
  function walk(dir: string) {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && entry.name !== "node_modules") {
        if (junkPatterns.test(entry.name)) {
          rmSync(full, { recursive: true, force: true });
        } else {
          walk(full);
        }
      } else if (entry.isFile() && junkPatterns.test(entry.name)) {
        rmSync(full, { force: true });
      }
    }
  }
  walk(nmDir);
}

/** Remove build artifacts from native packages — keep only what's needed at runtime. */
function pruneNativePkg(dir: string) {
  const removals = ["build/Release/obj", "build/Release/obj.target", "build/Release/sqlite3.a", "build/Release/test_extension.node", "deps", "src", "binding.gyp"];
  for (const rel of removals) {
    const p = join(dir, rel);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
}

function copySqliteVecPlatform() {
  const platforms = ["sqlite-vec-darwin-arm64", "sqlite-vec-darwin-x64", "sqlite-vec-windows-x64", "sqlite-vec-linux-x64"];
  for (const name of platforms) {
    if (copyPkgOrPnpm(name)) break;
  }
}

function copyNodeLlamaCpp() {
  const srcPkg = join(serverNm, "node-llama-cpp");
  const destPkg = join(outDir, "node_modules", "node-llama-cpp");
  const keep = new Set(["dist", "package.json", "LICENSE", "README.md"]);
  mkdirSync(destPkg, { recursive: true });
  for (const entry of readdirSync(srcPkg)) {
    if (!keep.has(entry)) continue;
    cpSync(join(srcPkg, entry), join(destPkg, entry), { recursive: true });
  }
  console.log("  node-llama-cpp");

  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const wanted: Record<string, string[]> = {
    darwin: [`mac-${arch}-metal`],
    win32: [`win-${arch}`],
    linux: [`linux-${arch}`],
  };
  const keep_platforms = new Set(wanted[process.platform] ?? []);
  for (const plat of keep_platforms) {
    const name = `@node-llama-cpp/${plat}`;
    const src = join(serverNm, "@node-llama-cpp", plat);
    if (existsSync(src)) {
      const dest = join(outDir, "node_modules", "@node-llama-cpp", plat);
      mkdirSync(dirname(dest), { recursive: true });
      cpSync(src, dest, { recursive: true, dereference: true });
      console.log(`  ${name}`);
    } else {
      copyPkgOrPnpmScoped("@node-llama-cpp", plat);
    }
  }
}

/** Copy a package from server/node_modules or fall back to .pnpm store. */
function copyPkgOrPnpm(name: string): boolean {
  const dest = join(outDir, "node_modules", name);
  if (existsSync(dest)) return true;

  const direct = join(serverNm, name);
  if (existsSync(direct)) {
    cpSync(direct, dest, { recursive: true, dereference: true });
    console.log(`  ${name}`);
    return true;
  }

  for (const store of pnpmStores()) {
    const dirs = readdirSync(store).filter((d) => d.startsWith(name + "@"));
    for (const dir of dirs) {
      const src = join(store, dir, "node_modules", name);
      if (existsSync(src)) {
        cpSync(src, dest, { recursive: true, dereference: true });
        console.log(`  ${name} (from .pnpm)`);
        return true;
      }
    }
  }
  return false;
}

function copyPkgOrPnpmScoped(scope: string, sub: string) {
  const name = `${scope}/${sub}`;
  const dest = join(outDir, "node_modules", scope, sub);
  if (existsSync(dest)) return;

  const pnpmName = scope.replace("/", "+") + "+" + sub;
  for (const store of pnpmStores()) {
    const dirs = readdirSync(store).filter((d) => d.startsWith(pnpmName + "@"));
    for (const dir of dirs) {
      const src = join(store, dir, "node_modules", scope, sub);
      if (existsSync(src)) {
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(src, dest, { recursive: true, dereference: true });
        console.log(`  ${name} (from .pnpm)`);
        return;
      }
    }
  }
}

function pnpmStores(): string[] {
  return [join(serverNm, ".pnpm"), join(__dirname, "..", "node_modules", ".pnpm")]
    .filter((d) => existsSync(d));
}

function getDirectorySize(dir: string): number {
  let size = 0;
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else {
        try { size += statSync(p).size; } catch {}
      }
    }
  };
  walk(dir);
  return size;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
