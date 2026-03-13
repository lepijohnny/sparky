import type { AgentToolDef } from "../core/agent.types";
import { estimateTokens } from "../tokens";
export { estimateTokens };

const DEFAULT_CONTEXT_WINDOW = 8192;
const RESPONSE_RESERVE = 4096;
const MESSAGE_OVERHEAD = 4;

/**
 * Tracks how a model's context window is allocated across fixed costs
 * (system prompt, tool definitions, response reserve) and the remaining
 * budget available for conversation history.
 *
 * All values are in estimated tokens.
 */
export interface ContextBudget {
  total: number;
  system: number;
  tools: number;
  memory: number;
  reserve: number;
  available: number;
}

/** Estimates the token cost of serialized tool definitions. */
export function estimateToolTokens(tools: AgentToolDef[]): number {
  if (tools.length === 0) return 0;
  return estimateTokens(JSON.stringify(tools));
}

/** Computes a context budget given the model window and fixed costs. */
export function computeBudget(
  contextWindow: number | undefined,
  systemPrompt: string,
  tools: AgentToolDef[] = [],
  memoryTokens = 0,
): ContextBudget {
  const total = contextWindow ?? DEFAULT_CONTEXT_WINDOW;
  const system = estimateTokens(systemPrompt) + MESSAGE_OVERHEAD;
  const toolCost = estimateToolTokens(tools);
  const reserve = RESPONSE_RESERVE;
  const available = Math.max(0, total - system - toolCost - memoryTokens - reserve);

  return { total, system, tools: toolCost, memory: memoryTokens, reserve, available };
}
