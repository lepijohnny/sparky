/**
 * Auto-rename agent — generates a short chat title from the first user message.
 * Uses the default LLM connection, non-blocking, fire-and-forget.
 */
import type { Agent } from "../core/agent.types";

const SYSTEM = "Generate a short title (3-5 words) for this conversation based on the user's message. Return only the title, nothing else. No quotes, no punctuation at the end.";

export async function generateTitle(agent: Agent, message: string): Promise<string> {
  let title = "";
  for await (const event of agent.stream({
    system: SYSTEM,
    messages: [{ role: "user", content: message }],
    cancellation: AbortSignal.timeout(10_000),
  })) {
    if (event.type === "text.delta") title += event.content;
  }
  return title.trim().replace(/^["']|["']$/g, "").slice(0, 50);
}
