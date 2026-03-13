/**
 * Mock query base for testing. Returns predictable output per command type.
 */

const DELAY = parseInt(process.env.MOCK_DELAY_MS ?? "10", 10);

export async function init(): Promise<void> {}

export async function prompt(system: string, query: string): Promise<string> {
  await new Promise((r) => setTimeout(r, DELAY));
  if (system === "rewrite") return `rewritten: ${query}`;
  if (system === "expand") return `expanded-1: ${query}\nexpanded-2: ${query}`;
  if (system === "keywords") return query.split(" ").filter((w) => w.length > 2).join(", ");
  return query;
}

export async function dispose(): Promise<void> {}
