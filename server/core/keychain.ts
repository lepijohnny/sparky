import { execSync, spawn } from "node:child_process";
import type { KeychainProvider } from "./secrets";

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.stdin.end();
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} failed (exit ${code}): ${stderr.trim()}`));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function createDarwinKeychain(): KeychainProvider {
  const service = "com.sparky.chat";

  return {
    async resolve(account) {
      return run("security", ["find-generic-password", "-s", service, "-a", account, "-w"]);
    },

    async store(account, value) {
      try { execSync(`security delete-generic-password -s "${service}" -a "${account}"`, { stdio: "ignore" }); } catch {}
      await run("security", ["add-generic-password", "-s", service, "-a", account, "-w", value]);
    },

    async remove(account) {
      try { execSync(`security delete-generic-password -s "${service}" -a "${account}"`, { stdio: "ignore" }); } catch {}
    },
  };
}

function createLinuxKeychain(): KeychainProvider {
  return {
    async resolve(account) {
      return run("secret-tool", ["lookup", "application", "com.sparky.chat", "account", account]);
    },

    async store(account, value) {
      const proc = spawn("secret-tool", ["store", "--label", `Sparky: ${account}`, "application", "com.sparky.chat", "account", account], { stdio: ["pipe", "pipe", "pipe"] });
      proc.stdin.write(value);
      proc.stdin.end();
      await new Promise<void>((resolve, reject) => {
        proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`secret-tool store failed (exit ${code})`)));
      });
    },

    async remove(account) {
      try { await run("secret-tool", ["clear", "application", "com.sparky.chat", "account", account]); } catch {}
    },
  };
}

function createWindowsKeychain(): KeychainProvider {
  return {
    async resolve(account) {
      const result = await run("powershell", ["-NoProfile", "-Command", [
        `Add-Type -AssemblyName System.Security;`,
        `$cred = Get-Item "HKCU:\\Software\\Sparky\\Credentials\\${account}" -ErrorAction Stop;`,
        `$encrypted = [Convert]::FromBase64String($cred.GetValue('data'));`,
        `$bytes = [Security.Cryptography.ProtectedData]::Unprotect($encrypted, $null, 'CurrentUser');`,
        `[Text.Encoding]::UTF8.GetString($bytes)`,
      ].join(" ")]);
      return result;
    },

    async store(account, value) {
      const b64 = Buffer.from(value, "utf-8").toString("base64");
      await run("powershell", ["-NoProfile", "-Command", [
        `Add-Type -AssemblyName System.Security;`,
        `$bytes = [Convert]::FromBase64String('${b64}');`,
        `$encrypted = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, 'CurrentUser');`,
        `$encB64 = [Convert]::ToBase64String($encrypted);`,
        `New-Item -Path "HKCU:\\Software\\Sparky\\Credentials\\${account}" -Force | Out-Null;`,
        `Set-ItemProperty -Path "HKCU:\\Software\\Sparky\\Credentials\\${account}" -Name 'data' -Value $encB64`,
      ].join(" ")]);
    },

    async remove(account) {
      try {
        await run("powershell", ["-NoProfile", "-Command",
          `Remove-Item "HKCU:\\Software\\Sparky\\Credentials\\${account}" -Force -ErrorAction SilentlyContinue`
        ]);
      } catch {}
    },
  };
}

export function createPlatformKeychain(): KeychainProvider {
  switch (process.platform) {
    case "darwin": return createDarwinKeychain();
    case "linux": return createLinuxKeychain();
    case "win32": return createWindowsKeychain();
    default: throw new Error(`Unsupported platform for keychain: ${process.platform}`);
  }
}
