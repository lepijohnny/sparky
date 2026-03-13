import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { Agent, AgentEvent, AgentTurn } from "../agent.types";
import { getPrompt } from "./adapter.encode64";

interface TimedEvent {
  delay: number;
  event: AgentEvent;
}

/**
 * Wraps any agent and records the event stream to a JSON file.
 * Use in dev to capture real sessions for replay in tests.
 *
 * Usage:
 *   const agent = new RecordingAgent(realAgent, "/tmp/session.json");
 *   // use normally — events pass through, timings are recorded
 *   // after stream ends, file is written automatically
 */
export class RecordingAgent implements Agent {
  constructor(
    private inner: Agent,
    private outputPath: string,
  ) {}

  async *stream(turn: AgentTurn): AsyncGenerator<AgentEvent> {
    const events: TimedEvent[] = [];
    let lastTime = Date.now();

    for await (const event of this.inner.stream(turn)) {
      const now = Date.now();
      events.push({ delay: now - lastTime, event });
      lastTime = now;
      yield event;
    }

    const lastUserMsg = [...turn.messages].reverse().find((m) => m.role === "user");
    const prompt = lastUserMsg ? getPrompt(lastUserMsg.content) : "";

    await mkdir(dirname(this.outputPath), { recursive: true });
    await writeFile(
      this.outputPath,
      JSON.stringify({ id: basename(this.outputPath, ".json"), description: "Recorded session", prompt, rounds: [{ events }] }, null, 2),
    );
  }
}
