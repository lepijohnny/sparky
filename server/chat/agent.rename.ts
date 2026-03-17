/**
 * Auto-rename agent — generates a short chat title from the first user message.
 * Uses the default LLM connection, non-blocking, fire-and-forget.
 */
import type { Agent } from "../core/agent.types";

const SYSTEM = `Generate a short title (3-5 words) that captures the TOPIC of the user's message. Return only the title, nothing else. No quotes, no punctuation at the end.

Rules:
- Focus on WHAT the user is asking about, not HOW it will be answered.
- Never reflect on your own capabilities or limitations.
- Never include words like "help", "request", "question", or "assist".
- Treat tool mentions (@brave, @search, etc.) as context hints, not title content.

Examples:
- "@brave search news today" → "Today's News"
- "can you help me fix this bug in my React app" → "React App Bug Fix"
- "what's the weather in Amsterdam" → "Amsterdam Weather"
- "explain quantum computing to me like I'm 5" → "Quantum Computing Explained"
- "search for best Italian restaurants nearby" → "Italian Restaurants Nearby"

Bad titles (never generate these):
- "I Cannot Search The Web"
- "Help With A Request"
- "User Asks About Weather"
- "Assisting With Bug Fix"`;

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
