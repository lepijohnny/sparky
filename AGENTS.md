# AGENTS.md

## Agent Notes

Always read `README.md` first for current status, repo layout, and future work.

## Repo Layout

```
app/            React frontend (Vite, React 19, TypeScript, CSS Modules)
auth-core/      Shared auth types (AuthFlow, AuthPluginContext, grants)
auth-flows/     Auth flow plugins (pat, local, cli-device, oauth-pkce)
server/         Node.js sidecar (TypeScript, WebSocket API)
  chat/         Chat CRUD, conversation loop, context builder
  core/         Adapters, bus, auth, proxy, registry, search
  knowledge/    RAG pipeline — chunking, indexing, search, worker
  prompts/      Built-in role files, API docs, format guides
  settings/     Workspace settings (appearance, labels, LLM, profile)
  tools/        Tool definitions with Zod schemas (app_* naming)
src-tauri/      Tauri shell (Rust) — window, IPC, model downloads, sidecar
scripts/        Build helpers (macOS, Windows)
docs/           Architecture docs and assets
website/        Docusaurus documentation site (getsparky.chat)
```

## Architecture

```
┌──────────────┐    ┌───────────────┐    ┌────────────────┐
│  Tauri (Rust)│───▶│ Sidecar (Node)│───▶│ Worker (Node)  │
│  persistent  │    │  WebSocket API│    │  llama.cpp     │
│  window, IPC │    │  SQLite, RAG  │    │  embed, rerank │
└──────┬───────┘    └───────┬───────┘    └────────────────┘
       │                    │
       │  WebView           │  ws://
       ▼                    │
┌─────────────┐             │
│  React App  │◀────────────┘
│  Vite, CSM  │
└─────────────┘
```

- **Tauri (Rust)**: Persistent process. Owns the window, file dialogs, model downloads, secrets keychain. Bundles Node binary, spawns the sidecar.
- **Sidecar (Node)**: `server/index.ts` — runs under bundled Node 22. WebSocket server for the frontend. Handles chat, knowledge indexing, LLM routing (Anthropic, Copilot, Google Gemini, Ollama). Polls parent PID every 5s to self-terminate if Tauri dies. Production mode uses esbuild-bundled `server/dist/server.mjs`.
- **Worker (Node)**: Single child process (`server/knowledge/worker/kt.worker.ts`) spawned by sidecar. Runs llama.cpp inference — embedding, keyword extraction, query expansion, reranking. One process, multiple models loaded on demand.
- **React App**: Vite + React 19 + CSS Modules. Communicates with sidecar over WebSocket. Tauri APIs for native features (dialogs, shell, IPC).

## Building & Testing

Requires Node v22.22.0 via fnm (see `.node-version`). System node with a different major version will cause native module ABI mismatches.

```sh
# Install fnm and activate (reads .node-version automatically)
brew install fnm
eval "$(fnm env --use-on-cd)"
fnm install && fnm use

# Install dependencies (pnpm workspace — from project root)
pnpm install

# Rebuild native modules against Node 22
cd server && pnpm rebuild better-sqlite3 sqlite-vec && cd ..

# Run frontend tests
cd app && pnpm test

# Run backend tests
cd server && npx vitest run

# Dev mode (Tauri + Vite + Sidecar)
cargo tauri dev

# Production build
cd server && npx tsx build.ts && cd ..
cd app && pnpm run build && cd ..
cargo tauri build
```

## Local State

All application state lives in `~/.sparky/`:

```
~/.sparky/
├── config.json            Global app config (active workspace, window state)
├── env.json               Environment variables for sidecar
├── cred.enc               Encripted passwords and secrets
├── extractors.json        Extractor plugin options (global, not per-workspace)
├── logs/                  Application logs (pruned to last 3 days on startup)
├── models/                Shared GGUF models (embed, rerank) — used by all workspaces
├── plugins/ext/           Extractor plugins installed via npm
├── themes/                Custom UI themes
└── workspaces/
    └── <workspace-name>/
        ├── workspace.db       SQLite — chats, messages, settings, labels
        └── workspace.kt.db   SQLite + sqlite-vec — knowledge chunks, FTS5 index, vector embeddings
```

Each workspace is fully isolated. `workspace.db` stores all chat and settings data (better-sqlite3). `workspace.kt.db` stores the knowledge base — document chunks, FTS5 full-text index, and sqlite-vec vector embeddings for semantic search.

All secrets (API keys, tokens) are stored in the OS native keychain (macOS Keychain, Windows DPAPI) — never in plain text.

## Key Conventions

**Tech stack**: Tauri 2 (Rust), React 19, Vite 7, TypeScript 5.9, better-sqlite3, node-llama-cpp, Vitest 4, CSS Modules. pnpm is the package manager.

**Node**: Always v22.22.0. Production uses a bundled Node binary (in `Contents/Resources/binaries/node`). Development requires Node 22 via fnm (reads `.node-version`) so native modules compile against the correct ABI.

**Imports**: Always use top-level `import` statements. Never use `require()` — the project is ESM.

**Test naming**: `given <precondition>, when <action>, then <expected result>`.

**TypeScript style**: Prefer interfaces + factory functions over classes. Use closures over private fields. Export an interface for the public API and a `createX()` factory that returns it. No `new` in consumer code when avoidable.

**Tool naming**: `app_<domain>_<action>` prefix for all custom tools. Zod schemas for input validation.

**File naming**: Dot notation (e.g. `tool.bus.emit.ts`), not kebab-case.

**No switch statements** for tool/event routing — use registry maps.

**Comments**: No inline comments. Only top-level doc comments (`/** */`) when needed.

**CSP with `dangerousDisableAssetCspModification: true`**: Tauri's default CSP processing injects nonces into `<style>` tags, but inline SVG `<style>` elements (used by beautiful-mermaid) don't get nonces and get blocked. This flag tells Tauri to use the CSP string as-is without modification.

**Roles**: Two built-in roles in `server/prompts/roles/` — `sparky` (all chats) and `connection` (service setup). Prompts are internal/bundled, not user-editable.

**No auto-commits**: The user decides when to commit.
