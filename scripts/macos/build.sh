#!/bin/bash
# Development build script.
# Installs dependencies, rebuilds native modules against the bundled
# Node binary (v22), then bundles the server for Tauri.
#
# Usage: bash ./scripts/macos/build.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"

# Use bundled node for rebuild so native modules match the ABI
ARCH="$(uname -m)"
case "$ARCH" in
  arm64|aarch64) TRIPLE="aarch64-apple-darwin" ;;
  x86_64)        TRIPLE="x86_64-apple-darwin" ;;
  *)             echo "Unsupported arch: $ARCH" ; exit 1 ;;
esac
BUNDLED_NODE="$PROJECT_DIR/src-tauri/binaries/node-$TRIPLE"
if [ -x "$BUNDLED_NODE" ]; then
  BUNDLED_DIR="$(dirname "$BUNDLED_NODE")"
  export PATH="$BUNDLED_DIR:$PATH"
  ln -sf "$BUNDLED_NODE" "$BUNDLED_DIR/node"
  echo "Using bundled Node: $("$BUNDLED_NODE" --version)"
else
  echo "Bundled node not found at $BUNDLED_NODE — run 'cargo build' first"
  echo "Using system Node: $(node --version)"
fi

# ── 1. Install tauri-cli if missing ──

if ! cargo tauri --version >/dev/null 2>&1; then
  echo "Installing tauri-cli..."
  cargo install tauri-cli
fi

# ── 2. Install dependencies ──

echo "Installing dependencies..."
(cd "$PROJECT_DIR" && pnpm install)

# ── 3. Rebuild native modules ──

echo "Rebuilding native modules..."
(cd "$PROJECT_DIR/server" && pnpm rebuild better-sqlite3 sqlite-vec)

# ── 4. Clean non-native platform packages ──

cd "$PROJECT_DIR/server"

ARCH="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in darwin) NATIVE_OS="darwin" ;; linux) NATIVE_OS="linux" ;; *) NATIVE_OS="$OS" ;; esac
case "$ARCH" in arm64|aarch64) NATIVE_ARCH="arm64" ;; x86_64) NATIVE_ARCH="x64" ;; *) NATIVE_ARCH="$ARCH" ;; esac
NATIVE="${NATIVE_OS}-${NATIVE_ARCH}"

echo "Removing non-native platform packages (keeping $NATIVE)..."

FOREIGN="linux win32 freebsd sunos openbsd android aix openharmony linuxmusl"
[ "$NATIVE_OS" = "linux" ] && FOREIGN="darwin win32 freebsd sunos openbsd android aix openharmony"
[ "$NATIVE_OS" = "darwin" ] || FOREIGN="$FOREIGN darwin"

find node_modules/.pnpm -maxdepth 1 -mindepth 1 -type d | while read -r d; do
  name="$(basename "$d")"
  for os in $FOREIGN; do
    case "$name" in *"-${os}-"*|*"+${os}-"*)
      rm -rf "$d"
      break
      ;; esac
  done
  case "$name" in *"${NATIVE_OS}-"*)
    case "$name" in *"${NATIVE}"*) ;; *)
      rm -rf "$d"
      ;; esac
    ;; esac
done

find node_modules/.pnpm -type l ! -exec test -e {} \; -delete 2>/dev/null || true
for link in node_modules/.bin/*; do
  [ -L "$link" ] && [ ! -e "$link" ] && rm "$link"
done

# ── 5. Bundle server with esbuild ──

echo "Bundling server..."
(cd "$PROJECT_DIR/server" && npx tsx build.ts)

echo "Build complete."
