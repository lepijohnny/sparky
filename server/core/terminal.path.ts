import { execSync } from "node:child_process";

/** Resolve the user's full PATH from a login shell.
 *  macOS GUI apps (Tauri) inherit a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin).
 *  Running a login shell sources ~/.zshrc / ~/.bash_profile to pick up
 *  Homebrew, nvm, pyenv, and other user-installed tool paths. */
export function initTerminalPath(): void {
  if (process.platform !== "darwin" && process.platform !== "linux") return;

  try {
    const userShell = process.env.SHELL || "/bin/zsh";
    const loginPath = execSync(`${userShell} -ilc 'echo $PATH'`, {
      encoding: "utf-8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    if (loginPath) process.env.PATH = loginPath;
  } catch {
    // best effort — keep existing PATH
  }
}
