import type { Agent, AgentEvent, AgentTurn } from "../agent.types";

interface TimedEvent {
  delay: number;
  event: AgentEvent;
}

interface MockRound {
  events: TimedEvent[];
}

export interface MockScenario {
  id: string;
  description: string;
  prompt?: string;
  rounds: MockRound[];
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Generic mock agent that replays AgentEvent sequences with simulated delays.
 * Stateful: tracks which round it's on. Each `stream()` call replays the next round.
 * After all rounds are exhausted, replays the last round on subsequent calls.
 * Respects `cancellation` from AgentTurn — aborts mid-delay when stop is requested.
 */
export class MockAgent implements Agent {
  private roundIndex = 0;

  constructor(
    private scenario: MockScenario,
    private delayScale: number = 1,
  ) {}

  async *stream(turn: AgentTurn): AsyncGenerator<AgentEvent> {
    const { cancellation: signal } = turn;
    const round = this.scenario.rounds[
      Math.min(this.roundIndex, this.scenario.rounds.length - 1)
    ];
    this.roundIndex++;

    try {
      for (const { delay, event } of round.events) {
        const ms = delay * this.delayScale;
        if (ms > 0) await abortableDelay(ms, signal);
        yield event;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }
      throw err;
    }
  }
}
