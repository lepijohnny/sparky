import { z } from "zod/v4";
import { exec } from "node:child_process";
import { defineTool } from "./tool.registry";

const MAX_OUTPUT = 50 * 1024;
const MAX_LINES = 2000;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function truncateOutput(raw: string): string {
  const lines = raw.split("\n");
  if (lines.length <= MAX_LINES && Buffer.byteLength(raw, "utf-8") <= MAX_OUTPUT) return raw;

  if (lines.length > MAX_LINES) {
    const kept = lines.slice(-MAX_LINES);
    return `[Output truncated — showing last ${MAX_LINES} of ${lines.length} lines]\n${kept.join("\n")}`;
  }

  const bytes = Buffer.byteLength(raw, "utf-8");
  if (bytes > MAX_OUTPUT) {
    const trimmed = raw.slice(-MAX_OUTPUT);
    return `[Output truncated — showing last ${formatSize(MAX_OUTPUT)} of ${formatSize(bytes)}]\n${trimmed}`;
  }

  return raw;
}

interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
  killed: boolean;
}

function run(command: string, timeoutMs: number, signal?: AbortSignal): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = exec(command, {
      encoding: "utf-8",
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      shell: "/bin/bash",
    }, (err, stdout, stderr) => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve({
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
        code: err ? (typeof (err as any).code === "number" ? (err as any).code : ((err as any).status ?? 1)) : 0,
        killed: child.killed || !!(err as any)?.killed || (err as any)?.signal === "SIGTERM",
      });
    });

    const onAbort = () => child.kill("SIGTERM");
    if (signal) {
      if (signal.aborted) { child.kill("SIGTERM"); return; }
      signal.addEventListener("abort", onAbort);
    }
  });
}

export const bash = defineTool({
  name: "app_bash",
  description:
    "Execute a bash command. Returns stdout and stderr. " +
    `Output is truncated to last ${MAX_LINES} lines or ${formatSize(MAX_OUTPUT)} (whichever is hit first). ` +
    "Optionally provide a timeout in seconds (default: 30s).",
  schema: z.object({
    command: z.string().describe("Bash command to execute"),
    timeout: z.number().optional().describe("Timeout in seconds (default: 30)"),
  }),
  trustScope: "bash",
  trustTarget: (input) => input.command,
  category: "execute",
  summarize: (input) => {
    const cmd = input.command.length > 60 ? `${input.command.slice(0, 57)}...` : input.command;
    return `$ ${cmd}`;
  },
  async execute(input, ctx) {
    const MAX_TIMEOUT = 5 * 60 * 1000;
    const requestedMs = (input.timeout ?? 30) * 1000;
    const timeoutMs = Math.min(requestedMs, MAX_TIMEOUT);
    if (requestedMs > MAX_TIMEOUT) ctx.log.warn("app_bash timeout capped", { requested: requestedMs, capped: MAX_TIMEOUT });
    ctx.log.info("app_bash", { command: input.command, timeout: timeoutMs });

    const { stdout, stderr, code, killed } = await run(input.command, timeoutMs, ctx.signal);

    if (killed) {
      const partial = truncateOutput(stdout.trimEnd() || stderr.trimEnd());
      return `Error: command timed out after ${input.timeout ?? 30}s${partial ? `\n${partial}` : ""}`;
    }

    if (code === 0) {
      const output = truncateOutput(stdout.trimEnd());
      return output || "(no output)";
    }

    const parts: string[] = [];
    if (stdout.trimEnd()) parts.push(truncateOutput(stdout.trimEnd()));
    if (stderr.trimEnd()) parts.push(truncateOutput(stderr.trimEnd()));
    const combined = parts.join("\n");

    return combined
      ? `Exit code ${code}\n${combined}`
      : `Exit code ${code}`;
  },
});
