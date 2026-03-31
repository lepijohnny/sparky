import { describe, test, expect } from "vitest";
import { matchFilter, type FilterableChat } from "../actions/routine.action.filter";

function makeChat(overrides?: Partial<FilterableChat>): FilterableChat {
  return {
    id: crypto.randomUUID(),
    name: "Test Chat",
    archived: false,
    flagged: false,
    labels: [],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("matchFilter", () => {
  test("given empty filter, when matchFilter, then returns all chats", () => {
    const chats = [makeChat(), makeChat()];
    expect(matchFilter(chats, {})).toHaveLength(2);
  });

  test("given archived filter, when matchFilter, then returns only matching", () => {
    const chats = [
      makeChat({ archived: true }),
      makeChat({ archived: false }),
    ];
    expect(matchFilter(chats, { archived: true })).toHaveLength(1);
    expect(matchFilter(chats, { archived: true })[0].archived).toBe(true);
  });

  test("given flagged filter, when matchFilter, then returns only flagged", () => {
    const chats = [
      makeChat({ flagged: true }),
      makeChat({ flagged: false }),
    ];
    expect(matchFilter(chats, { flagged: true })).toHaveLength(1);
  });

  test("given nameContains filter, when matchFilter, then matches case-insensitively", () => {
    const chats = [
      makeChat({ name: "Weekly Report" }),
      makeChat({ name: "Daily standup" }),
      makeChat({ name: "Report summary" }),
    ];
    expect(matchFilter(chats, { nameContains: "report" })).toHaveLength(2);
  });

  test("given hasLabel filter, when matchFilter, then returns chats with that label", () => {
    const chats = [
      makeChat({ labels: ["work", "urgent"] }),
      makeChat({ labels: ["personal"] }),
      makeChat({ labels: [] }),
    ];
    expect(matchFilter(chats, { hasLabel: "work" })).toHaveLength(1);
    expect(matchFilter(chats, { hasLabel: "urgent" })).toHaveLength(1);
    expect(matchFilter(chats, { hasLabel: "missing" })).toHaveLength(0);
  });

  test("given olderThan filter, when matchFilter, then returns chats older than N days", () => {
    const now = Date.now();
    const chats = [
      makeChat({ updatedAt: new Date(now - 40 * 86400000).toISOString() }),
      makeChat({ updatedAt: new Date(now - 10 * 86400000).toISOString() }),
      makeChat({ updatedAt: new Date(now - 1 * 86400000).toISOString() }),
    ];
    expect(matchFilter(chats, { olderThan: 30 })).toHaveLength(1);
    expect(matchFilter(chats, { olderThan: 5 })).toHaveLength(2);
  });

  test("given combined filters, when matchFilter, then all conditions must match", () => {
    const now = Date.now();
    const chats = [
      makeChat({ name: "Old Report", archived: false, updatedAt: new Date(now - 40 * 86400000).toISOString() }),
      makeChat({ name: "New Report", archived: false, updatedAt: new Date(now - 1 * 86400000).toISOString() }),
      makeChat({ name: "Old Archived", archived: true, updatedAt: new Date(now - 40 * 86400000).toISOString() }),
    ];
    const result = matchFilter(chats, { nameContains: "report", olderThan: 30, archived: false });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Old Report");
  });
});
