import { readFile } from "node:fs/promises";

export const extensions = [".txt"];

export async function* extract(target: string, log: (msg: string) => void) {
  const text = await readFile(target, "utf-8");

  const sections: { offset: number; label?: string }[] = [];
  const re = /\n{3,}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const nextOffset = match.index + match[0].length;
    if (nextOffset < text.length) {
      sections.push({ offset: nextOffset });
    }
  }

  yield { text, sections: sections.length > 0 ? sections : undefined };
}
