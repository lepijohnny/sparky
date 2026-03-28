# Contributing to Sparky

Thank you for your interest in contributing to Sparky! We welcome bug fixes, features, documentation improvements, and ideas.

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | 1.93+ | [rustup.rs](https://www.rust-lang.org/tools/install) |
| Node.js | 22.x | via [fnm](https://github.com/Schniz/fnm) (see below) |
| pnpm | 10+ | `corepack enable pnpm` (ships with Node) |
| Tauri CLI | 2.x | `cargo install tauri-cli` |

### Node.js via fnm

The project bundles a Node 22 binary for production. For development you need Node 22 on your system so native modules compile against the correct ABI.

We recommend [fnm](https://github.com/Schniz/fnm) which reads the `.node-version` file and switches automatically:

```bash
# macOS
brew install fnm
echo 'eval "$(fnm env --use-on-cd)"' >> ~/.zshrc
source ~/.zshrc

# Windows (PowerShell)
winget install Schniz.fnm

# Activate fnm in current shell (add this line to $PROFILE for persistence)
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression

# Install the required Node version (reads .node-version)
fnm install
fnm use
node --version   # v22.22.0
```

> **Why Node 22?** Native modules (`better-sqlite3`, `sqlite-vec`) are compiled against the Node ABI at install time. If you compile with Node 25 but the app runs Node 22, you get `NODE_MODULE_VERSION` mismatch errors. fnm ensures your shell always uses the right version.

## Setup (macOS)

```bash
git clone https://github.com/lepijohnny/sparky.git
cd sparky

# Enable pnpm via corepack (ships with Node)
corepack enable pnpm

# Install all dependencies (pnpm workspace — from project root)
pnpm install

# Rebuild native modules against Node 22
cd server && pnpm rebuild better-sqlite3 sqlite-vec && cd ..

# Start development mode (Tauri + Vite + Sidecar)
cargo tauri dev
```

`cargo tauri dev` does three things:
1. Runs `build.rs` which downloads the Node 22 binary into `src-tauri/binaries/` (first time only).
2. Starts the Vite dev server for the frontend.
3. Launches the Tauri window which starts the Node sidecar.

## Setup (Windows)

```powershell
git clone https://github.com/lepijohnny/sparky.git
cd sparky

# Activate fnm (if not in $PROFILE already)
fnm env --use-on-cd --shell powershell | Out-String | Invoke-Expression
fnm install; fnm use

# Enable pnpm via corepack (ships with Node)
corepack enable pnpm

pnpm install
cd server; pnpm rebuild better-sqlite3 sqlite-vec; cd ..

cargo tauri dev
```

## Building for Release

### macOS

```bash
# Bundle server (esbuild → server/dist/)
cd server && npx tsx build.ts && cd ..

# Build frontend
cd app && pnpm run build && cd ..

# Build .app + .dmg
TAURI_SIGNING_PRIVATE_KEY="" cargo tauri build --bundles dmg
```

Output: `src-tauri/target/release/bundle/dmg/Sparky_x.x.x_aarch64.dmg`

### Windows

```powershell
cd server; npx tsx build.ts; cd ..
cd app; pnpm run build; cd ..

$env:TAURI_SIGNING_PRIVATE_KEY = ""
cargo tauri build --bundles nsis
```

Output: `src-tauri\target\release\bundle\nsis\Sparky_x.x.x_x64-setup.exe`

## Running Tests

```bash
# Frontend (from app/)
cd app && pnpm test

# Backend (from server/)
cd server && npx vitest run
```

All tests must pass with Node 22. If you see native module errors, rebuild:

```bash
cd server && pnpm rebuild better-sqlite3 sqlite-vec
```

## Project Structure

```
app/            React frontend (Vite, TypeScript, CSS Modules)
server/         Node.js sidecar (TypeScript, WebSocket API, SQLite)
src-tauri/      Tauri shell (Rust) — window, IPC, model downloads
auth-core/      Shared auth types
auth-flows/     Auth flow plugins (PAT, local, device, OAuth PKCE)
scripts/        Build helpers
website/        Docusaurus docs site (getsparky.chat)
```

## Code Style

- **TypeScript** — Prefer interfaces + factory functions over classes. No `new` in consumer code when avoidable.
- **ESM only** — Always use top-level `import` statements, never `require()`.
- **No inline comments** — Only top-level doc comments (`/** */`) when needed.
- **Test naming** — `given <precondition>, when <action>, then <expected result>`.
- **CSS Modules** — All component styles use `.module.css` files.
- **Tool naming** — `app_<domain>_<action>` prefix for all custom tools.
- **File naming** — Dot notation (e.g. `tool.bus.emit.ts`), not kebab-case.
- **No switch statements** for tool/event routing — use registry maps.
- **Zod schemas** for tool input validation.

## Reporting Issues

Open an issue on GitHub with:
- Steps to reproduce
- Expected vs actual behavior
- OS and version
- Sparky version (Settings → About)
