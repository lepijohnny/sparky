/**
 * Model worker (sparky-worker) — runs model inference in a child process.
 * Owns a queue of work items and drains them sequentially. Each command
 * type (embed, rewrite, expand, rerank) dispatches to a separate fn file
 * that lazy-loads its model on first use.
 *
 * Receives parent PID as argv[2] and self-terminates if parent dies.
 * Set WORKER_FN_DIR env to override fn directory for testing.
 *
 * Protocol (Parent → Worker):
 *   init     { cacheDir }                              — set model directory
 *   embed    { requestId, texts, priority }             — embed texts
 *   rewrite  { requestId, query, priority }             — rewrite query
 *   expand   { requestId, query, priority }             — expand query
 *   rerank   { requestId, query, documents, priority }  — rerank documents
 *   cancel   { requestId }                              — best-effort cancel
 *   shutdown                                            — cleanup and exit
 *
 * Protocol (Worker → Parent):
 *   ready                                 — initialized
 *   done     { requestId, result }        — completed job
 *   error    { requestId, error }         — failed job
 *   skip     { requestId }               — cancelled or shutdown-skipped
 *   drained                               — queue empty
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.title = "sparky-worker";
console.log = (...args: any[]) => console.error(...args);

const __dir = dirname(fileURLToPath(import.meta.url));
const fnDir = process.env.WORKER_FN_DIR ?? __dir;
const parentPid = parseInt(process.argv[2], 10);

const orphanCheck = setInterval(() => {
  try { process.kill(parentPid, 0); } catch {
    console.error(`sparky.worker: parent (pid ${parentPid}) gone, exiting`);
    process.exit(0);
  }
}, 10_000);

process.on("disconnect", () => process.exit(0));

let cacheDir = "";
let shutdownRequested = false;
let draining = false;
const cancelledIds = new Set<string>();

type WorkItem =
  | { requestId: string; type: "embed"; texts: string[] }
  | { requestId: string; type: "rewrite"; query: string }
  | { requestId: string; type: "keywords"; query: string }
  | { requestId: string; type: "expand"; query: string }
  | { requestId: string; type: "rerank"; query: string; documents: string[] };

const queue: WorkItem[] = [];

function enqueue(item: WorkItem, priority: string) {
  if (priority === "high") queue.unshift(item);
  else queue.push(item);
}

const fns: Record<string, any> = {};

async function loadFn(type: string): Promise<any> {
  if (fns[type]) return fns[type];
  const tsPath = join(fnDir, `kt.worker.${type}.fn.ts`);
  const mjsPath = join(fnDir, `kt.worker.${type}.fn.mjs`);
  const modulePath = await import("node:fs").then((fs) => fs.existsSync(tsPath) ? tsPath : mjsPath);
  const mod = await import(modulePath);
  await mod.init(cacheDir);
  fns[type] = mod;
  return mod;
}

async function execute(item: WorkItem): Promise<unknown> {
  const fn = await loadFn(item.type);
  switch (item.type) {
    case "embed": return fn.embed(item.texts);
    case "rewrite": return fn.rewrite(item.query);
    case "keywords": return fn.keywords(item.query);
    case "expand": return fn.expand(item.query);
    case "rerank": return fn.rerank(item.query, item.documents);
    default: throw new Error(`Unknown command: ${(item as any).type}`);
  }
}

async function drain() {
  if (draining) return;
  draining = true;

  try {
    while (queue.length > 0) {
      const item = queue.shift()!;

      if (shutdownRequested || cancelledIds.delete(item.requestId)) {
        process.send!({ type: "skip", requestId: item.requestId });
        continue;
      }

      try {
        const result = await execute(item);
        process.send!({ type: "done", requestId: item.requestId, result });
      } catch (err: any) {
        process.send!({ type: "error", requestId: item.requestId, error: err?.message ?? String(err) });
      }
    }

    if (shutdownRequested) {
      for (const fn of Object.values(fns)) {
        try { await fn.dispose(); } catch {}
      }
      clearInterval(orphanCheck);
      process.exit(0);
      return;
    }

    process.send!({ type: "drained" });
  } finally {
    draining = false;
  }
}

const COMMAND_TYPES = new Set(["embed", "rewrite", "keywords", "expand", "rerank"]);

process.on("message", async (msg: any) => {
  if (msg.type === "init") {
    cacheDir = msg.cacheDir;
    process.send!({ type: "ready" });
    return;
  }

  if (COMMAND_TYPES.has(msg.type)) {
    const { priority, ...item } = msg;
    enqueue(item as WorkItem, priority ?? "low");
    drain();
    return;
  }

  if (msg.type === "cancel") {
    cancelledIds.add(msg.requestId);
    return;
  }

  if (msg.type === "shutdown") {
    shutdownRequested = true;
    if (!draining && queue.length === 0) {
      for (const fn of Object.values(fns)) {
        try { await fn.dispose(); } catch {}
      }
      clearInterval(orphanCheck);
      process.exit(0);
    }
    return;
  }
});
