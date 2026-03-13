import { readFile } from "node:fs/promises";

export const extensions = [".md"];

function stripFrontmatter(text: string): string {
  if (!text.startsWith("---")) return text;
  const end = text.indexOf("\n---", 3);
  if (end === -1) return text;
  return text.slice(end + 4).trimStart();
}

export async function* extract(target: string, log: (msg: string) => void) {
  const raw = await readFile(target, "utf-8");
  const text = stripFrontmatter(raw);

  const sections: { offset: number; label?: string }[] = [];
  const re = /^#{1,3}\s+(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    sections.push({ offset: match.index, label: match[1].trim() });
  }

  yield { text, sections: sections.length > 0 ? sections : undefined };
}
