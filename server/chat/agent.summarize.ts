/**
 * Summarization agent — compresses older conversation turns into a concise summary.
 * Uses the default LLM connection, non-blocking, fire-and-forget.
 */
import type { Agent } from "../core/agent.types";
import type { Logger } from "../logger.types";
import type { ContextResult } from "./chat.context";
import type { ChatDatabase } from "./chat.db";
import type { ChatEntry, ChatSummary } from "./chat.types";

const BUDGET_THRESHOLD = 0.6;

const SYSTEM = "You are a concise conversation summarizer. Output only the summary, no preamble.";

const PROMPT = `Summarize this conversation concisely. Preserve:
- Key facts, names, numbers, and decisions
- User preferences and constraints stated
- Current task state and what was agreed upon
- Any unresolved questions
{EXISTING}
Conversation:
{MESSAGES}`;

export function shouldSummarize(ctx: ContextResult, existing: ChatSummary | null): boolean {
  if (!ctx.lastKnownMemoryId || !ctx.hasSkippedEntries) return false;

  const available = ctx.budget.conversationTokens + ctx.budget.remaining;
  if (available === 0) return false;

  const usage = ctx.budget.conversationTokens / available;
  if (usage < BUDGET_THRESHOLD) return false;

  if (existing && existing.coversUpTo >= ctx.lastKnownMemoryId) return false;

  return true;
}

function formatEntries(entries: ChatEntry[]): string {
  return entries
    .filter((e): e is Extract<ChatEntry, { kind: "message" }> => e.kind === "message")
    .map((e) => `${e.role === "user" ? "User" : "Assistant"}: ${e.content}`)
    .join("\n\n");
}

function buildPrompt(entries: ChatEntry[], existingSummary?: string): string {
  const existing = existingSummary
    ? `\nHere is the current summary of earlier messages — extend it with the new information:\n\n<existing-summary>\n${existingSummary}\n</existing-summary>\n`
    : "";
  return PROMPT
    .replace("{EXISTING}", existing)
    .replace("{MESSAGES}", formatEntries(entries));
}

async function summarize(agent: Agent, prompt: string): Promise<string> {
  let text = "";
  for await (const event of agent.stream({
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
    cancellation: AbortSignal.timeout(120_000),
  })) {
    if (event.type === "text.delta") text += event.content;
  }
  return text.trim();
}

export async function generateSummary(
  db: ChatDatabase,
  agent: Agent,
  chatId: string,
  lastKnownMemoryId: number,
  log: Logger,
): Promise<void> {
  const existing = db.getSummary(chatId);
  const fromRowid = existing && existing.coversUpTo > 0
    ? existing.coversUpTo + 1
    : db.getFirstUserMessageRowid(chatId) ?? 1;
  const toRowid = lastKnownMemoryId - 1;

  if (fromRowid > toRowid) return;

  const entries = db.getEntriesRange(chatId, fromRowid, toRowid);
  if (entries.length === 0) return;

  const summaryText = await summarize(agent, buildPrompt(entries, existing?.content));

  if (!summaryText) {
    log.warn("Summary generation returned empty content", { chatId });
    return;
  }

  db.upsertSummary(chatId, summaryText, toRowid);
  log.info("Summary generated", { chatId, coversUpTo: toRowid, length: summaryText.length });
}
