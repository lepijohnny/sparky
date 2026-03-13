import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuthPluginFactory } from "@sparky/auth-core";

export type VendorTool = "copilot" | "claude";

export interface CliDeviceFlowConfig {
  domain: string;
  provider: string;
  label: string;
  vendorTool: VendorTool;
  loginArgs: string[];
  codePattern: RegExp;
  successPattern: RegExp;
  onSuccess?: () => Promise<void>;
}

function resolveVendorPath(tool: VendorTool): string {
  const vendor = join(homedir(), ".sparky", "vendor");
  switch (tool) {
    case "copilot": {
      const arch = process.arch === "arm64" ? "arm64" : "x64";
      const os = process.platform === "darwin" ? "darwin" : process.platform === "win32" ? "win32" : "linux";
      return join(vendor, "copilot-cli", "node_modules", "@github", `copilot-${os}-${arch}`, "copilot");
    }
    case "claude":
      return join(vendor, "claude-cli", "node_modules", ".bin", "claude");
  }
}

function resolveNodeDir(): string {
  return join(homedir(), ".sparky", "vendor", "fnm", "aliases", "default", "bin");
}

export function createCliDeviceFlow(config: CliDeviceFlowConfig): AuthPluginFactory {
  return (ctx) => {
    let pending: ChildProcess | null = null;

    return [{
      definition: {
        domain: config.domain,
        provider: config.provider,
        grant: "device",
        label: config.label,
      },

      async request() {
        if (pending) {
          pending.kill();
          pending = null;
        }

        const cliPath = resolveVendorPath(config.vendorTool);
        if (!existsSync(cliPath)) {
          throw new Error(`${config.vendorTool} CLI not installed. Run dependency setup first.`);
        }

        const nodeDir = resolveNodeDir();
        const pathEnv = `${nodeDir}:${process.env.PATH ?? ""}`;

        ctx.log.info("Starting CLI device flow", { provider: config.provider, cliPath });

        const child = spawn(cliPath, config.loginArgs, {
          env: { ...process.env, PATH: pathEnv },
          stdio: ["pipe", "pipe", "pipe"],
        });

        pending = child;

        const rl = createInterface({ input: child.stdout! });

        child.stderr?.on("data", (chunk) => {
          ctx.log.debug("cli login stderr", { provider: config.provider, line: chunk.toString().trim() });
        });

        let userCode = "";
        let verificationUri = "";

        for await (const line of rl) {
          ctx.log.debug("cli login stdout", { provider: config.provider, line });
          const match = config.codePattern.exec(line);
          if (match) {
            verificationUri = match[1];
            userCode = match[2].replace(/[.,]+$/, "");
            break;
          }
        }

        if (!userCode) {
          child.kill();
          pending = null;
          throw new Error(`Could not parse device code from ${config.vendorTool} login output`);
        }

        ctx.log.info("Device code received", { provider: config.provider, userCode, verificationUri });
        return {
          grant: "device" as const,
          display: [
            { type: "code" as const, label: "Enter this code", value: userCode },
            { type: "url" as const, label: "Open authorization page", value: verificationUri },
          ],
        };
      },

      async verify() {
        const child = pending;
        pending = null;

        if (!child) {
          throw new Error("No pending device flow. Call auth.request first.");
        }

        const rl = createInterface({ input: child.stdout! });

        const ok = await new Promise<boolean>((resolve) => {
          let resolved = false;

          const done = (result: boolean) => {
            if (resolved) return;
            resolved = true;
            rl.close();
            resolve(result);
          };

          rl.on("line", (line) => {
            ctx.log.debug("cli login stdout (verify)", { provider: config.provider, line });
            if (config.successPattern.test(line)) {
              done(true);
            }
          });

          child.on("close", (code) => {
            ctx.log.info("CLI login exited", { provider: config.provider, code });
            done(code === 0);
          });

          child.on("error", (err) => {
            ctx.log.error("CLI login error", { provider: config.provider, error: String(err) });
            done(false);
          });
        });

        if (ok) {
          ctx.log.info("CLI login succeeded", { provider: config.provider });
          child.unref();
        } else {
          ctx.log.error("CLI device flow failed", { provider: config.provider });
          child.kill();
        }

        return { ok };
      },

      onSuccess: config.onSuccess,

      dispose() {
        if (pending) {
          pending.kill();
          pending = null;
        }
      },
    }];
  };
}
