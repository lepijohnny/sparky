import type { Logger } from "../../logger.types";
import type { Agent, AgentEvent, AgentTurn } from "../agent.types";

/** A recovery action: matches an error and produces a new agent to retry with */
export interface RecoveryAction {
  /** Test whether this error is recoverable */
  match: (error: string) => boolean;
  /** Run the recovery (e.g. refresh token) and return a new agent */
  recover: () => Promise<Agent>;
}

/**
 * Wraps an agent with recovery logic. When the inner agent throws an error
 * matching a registered RecoveryAction, it runs the recovery and retries
 * the stream once with the new agent. Non-matching errors and second
 * failures are yielded as error events.
 */
export class RecoverableAgent implements Agent {
  constructor(
    private inner: Agent,
    private actions: RecoveryAction[],
    private log: Logger,
  ) {}

  async *stream(turn: AgentTurn): AsyncGenerator<AgentEvent> {
    try {
      yield* this.inner.stream(turn);
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      const action = this.actions.find((a) => a.match(msg));

      if (!action) {
        yield { type: "error", message: msg };
        yield { type: "done" };
        return;
      }

      this.log.info("Recoverable error detected, recovering", { error: msg });

      try {
        const newAgent = await action.recover();
        this.inner = newAgent;
        yield* newAgent.stream(turn);
      } catch (retryErr: any) {
        yield { type: "error", message: retryErr?.message ?? String(retryErr) };
        yield { type: "done" };
      }
    }
  }
}
