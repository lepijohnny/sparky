process.title = "sparky-sidecar";

import { initTerminalPath } from "./core/terminal.path";
initTerminalPath();

/** Capture stdout during init — native modules may write to it */
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk: any, ...args: any[]) =>
  process.stderr.write(chunk, ...args);

import { createSparky } from "./sparky";

const app = createSparky();
const { port, token } = await app.start();

/** Restore stdout and print JSON for Tauri to read */
process.stdout.write = originalWrite;
console.log(JSON.stringify({ port, token }));

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.dispose();
  } catch {
    // best effort
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Self-terminate when parent process dies.
// stdin pipe detection: when parent closes, stdin emits "end".
process.stdin.resume();
process.stdin.on("end", shutdown);
process.stdin.on("close", shutdown);
process.stdin.on("error", () => {});

// Fallback: poll parent PID every 5s — catches SIGKILL/crash cases
const ppid = process.ppid;
const ppidTimer = setInterval(() => {
  try { process.kill(ppid, 0); } catch { shutdown(); }
}, 5000);
ppidTimer.unref();
