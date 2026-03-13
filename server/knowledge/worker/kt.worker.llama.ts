/**
 * Shared llama.cpp instance — singleton across all worker functions.
 * Each fn file calls getLlamaInstance() to avoid loading the engine multiple times.
 */

let llama: any = null;

export async function getLlamaInstance() {
  if (llama) return llama;
  const { getLlama } = await import("node-llama-cpp");
  llama = await getLlama();
  return llama;
}

export async function disposeLlama() {
  llama = null;
}
