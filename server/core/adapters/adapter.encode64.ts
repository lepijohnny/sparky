import { readFileSync } from "node:fs";
import type { MessageContent, MessagePart } from "../agent.types";

export function getPrompt(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content.filter((p) => p.type === "text").map((p) => p.text).join("");
}

export function encodeBase64(part: MessagePart): string {
  if (part.type === "text") return "";
  return readFileSync(part.filePath).toString("base64");
}
