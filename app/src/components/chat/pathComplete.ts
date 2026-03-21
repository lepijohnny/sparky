/** Extract path token from text (last whitespace-delimited word starting with /, ./, or ~/) */
export function extractPathToken(text: string): string | null {
  const parts = text.split(/[\s\n]/);
  const last = parts[parts.length - 1];
  if (last?.startsWith("~/") || last?.startsWith("./") || last?.startsWith("/")) return last;
  return null;
}

/** Get base path (everything up to and including last /) from a token */
export function pathBase(token: string): string {
  const lastSlash = token.lastIndexOf("/");
  return lastSlash >= 0 ? token.slice(0, lastSlash + 1) : "";
}

/** Get parent path from a token (go up one directory) */
export function pathParent(token: string): string | null {
  const withoutTrailing = token.endsWith("/") ? token.slice(0, -1) : token;
  const lastSlash = withoutTrailing.lastIndexOf("/");
  if (lastSlash < 0) return null;
  return withoutTrailing.slice(0, lastSlash + 1);
}

/** Get filter text (text after last /) */
export function pathFilter(token: string): string {
  const lastSlash = token.lastIndexOf("/");
  return lastSlash >= 0 ? token.slice(lastSlash + 1) : "";
}

/** Normalize double slashes */
export function normalizePath(path: string): string {
  return path.replace(/\/{2,}/g, "/");
}
