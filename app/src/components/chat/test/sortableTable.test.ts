import { describe, expect, it } from "vitest";
import { parseTable } from "../SortableTable";

describe("parseTable — bold header stripping", () => {
  it("given **bold** headers, then bold markers stripped", () => {
    const content = "| **Name** | **Age** |\n|---|---|\n| Alice | 30 |";
    const { headers } = parseTable(content);
    expect(headers).toEqual(["Name", "Age"]);
  });

  it("given mixed bold and plain headers, then only bold markers stripped", () => {
    const content = "| **Name** | Age | **Score** |\n|---|---|---|\n| A | 1 | 2 |";
    const { headers } = parseTable(content);
    expect(headers).toEqual(["Name", "Age", "Score"]);
  });

  it("given no bold headers, then unchanged", () => {
    const content = "| Name | Age |\n|---|---|\n| Alice | 30 |";
    const { headers } = parseTable(content);
    expect(headers).toEqual(["Name", "Age"]);
  });

  it("given multiple bold words in one header, then all stripped", () => {
    const content = "| **First** **Name** | Age |\n|---|---|\n| A | 1 |";
    const { headers } = parseTable(content);
    expect(headers).toEqual(["First Name", "Age"]);
  });

  it("given bold in rows, then rows unchanged", () => {
    const content = "| Name | Age |\n|---|---|\n| **Alice** | 30 |";
    const { headers, rows } = parseTable(content);
    expect(headers).toEqual(["Name", "Age"]);
    expect(rows[0][0]).toBe("**Alice**");
  });
});
