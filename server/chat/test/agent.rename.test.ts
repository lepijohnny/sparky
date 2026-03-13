import { describe, it, expect } from "vitest";
import { generateTitle } from "../agent.rename";
import { MockAgent, type MockScenario } from "../../core/adapters/agent.mock";

function titleScenario(title: string): MockScenario {
  return {
    id: "rename",
    description: "title generation",
    rounds: [{
      events: [
        { delay: 0, event: { type: "text.delta", content: title } },
        { delay: 0, event: { type: "text.done", content: title } },
        { delay: 0, event: { type: "done" } },
      ],
    }],
  };
}

describe("generateTitle", () => {
  it("given a user message, when agent responds with a title, then returns the title", async () => {
    const agent = new MockAgent(titleScenario("PSV European History"));
    const title = await generateTitle(agent, "Tell me about PSV's Champions League win");
    expect(title).toBe("PSV European History");
  });

  it("given a quoted title, when generated, then strips quotes", async () => {
    const agent = new MockAgent(titleScenario('"PSV European History"'));
    const title = await generateTitle(agent, "Tell me about PSV");
    expect(title).toBe("PSV European History");
  });

  it("given a long title, when generated, then truncates to 50 chars", async () => {
    const long = "A".repeat(80);
    const agent = new MockAgent(titleScenario(long));
    const title = await generateTitle(agent, "test");
    expect(title.length).toBe(50);
  });

  it("given streamed deltas, when agent streams word by word, then concatenates them", async () => {
    const scenario: MockScenario = {
      id: "rename",
      description: "streamed title",
      rounds: [{
        events: [
          { delay: 0, event: { type: "text.delta", content: "PSV " } },
          { delay: 0, event: { type: "text.delta", content: "European " } },
          { delay: 0, event: { type: "text.delta", content: "History" } },
          { delay: 0, event: { type: "text.done", content: "PSV European History" } },
          { delay: 0, event: { type: "done" } },
        ],
      }],
    };
    const agent = new MockAgent(scenario);
    const title = await generateTitle(agent, "Tell me about PSV");
    expect(title).toBe("PSV European History");
  });

  it("given an empty response, when agent returns nothing, then returns empty string", async () => {
    const scenario: MockScenario = {
      id: "rename",
      description: "empty",
      rounds: [{
        events: [
          { delay: 0, event: { type: "text.done", content: "" } },
          { delay: 0, event: { type: "done" } },
        ],
      }],
    };
    const agent = new MockAgent(scenario);
    const title = await generateTitle(agent, "test");
    expect(title).toBe("");
  });

  it("given whitespace padding, when generated, then trims the title", async () => {
    const agent = new MockAgent(titleScenario("  PSV History  "));
    const title = await generateTitle(agent, "test");
    expect(title).toBe("PSV History");
  });
});
