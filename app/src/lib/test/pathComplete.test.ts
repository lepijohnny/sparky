import { describe, test, expect } from "vitest";
import { extractPathToken, pathBase, pathParent, pathFilter, normalizePath } from "../pathComplete";

describe("pathComplete", () => {
  describe("extractPathToken", () => {
    test("given text ending with /, when extracting, then returns /", () => {
      expect(extractPathToken("hello /")).toBe("/");
    });

    test("given text ending with ~/, when extracting, then returns ~/", () => {
      expect(extractPathToken("open ~/")).toBe("~/");
    });

    test("given text ending with ./, when extracting, then returns ./", () => {
      expect(extractPathToken("read ./")).toBe("./");
    });

    test("given text ending with /Users/, when extracting, then returns /Users/", () => {
      expect(extractPathToken("look at /Users/")).toBe("/Users/");
    });

    test("given text ending with ~/Documents/file.ts, when extracting, then returns full path", () => {
      expect(extractPathToken("edit ~/Documents/file.ts")).toBe("~/Documents/file.ts");
    });

    test("given text with no path, when extracting, then returns null", () => {
      expect(extractPathToken("hello world")).toBeNull();
    });

    test("given empty text, when extracting, then returns null", () => {
      expect(extractPathToken("")).toBeNull();
    });

    test("given only /, when extracting, then returns /", () => {
      expect(extractPathToken("/")).toBe("/");
    });

    test("given path with newline before, when extracting, then returns path after newline", () => {
      expect(extractPathToken("first line\n/Users")).toBe("/Users");
    });
  });

  describe("pathBase", () => {
    test("given /Users/, when getting base, then returns /Users/", () => {
      expect(pathBase("/Users/")).toBe("/Users/");
    });

    test("given /Users/file.ts, when getting base, then returns /Users/", () => {
      expect(pathBase("/Users/file.ts")).toBe("/Users/");
    });

    test("given /, when getting base, then returns /", () => {
      expect(pathBase("/")).toBe("/");
    });

    test("given ~/Documents/, when getting base, then returns ~/Documents/", () => {
      expect(pathBase("~/Documents/")).toBe("~/Documents/");
    });

    test("given no slash, when getting base, then returns empty", () => {
      expect(pathBase("file")).toBe("");
    });
  });

  describe("pathParent", () => {
    test("given /Users/, when getting parent, then returns /", () => {
      expect(pathParent("/Users/")).toBe("/");
    });

    test("given /Users/john/, when getting parent, then returns /Users/", () => {
      expect(pathParent("/Users/john/")).toBe("/Users/");
    });

    test("given /, when getting parent, then returns null", () => {
      expect(pathParent("/")).toBeNull();
    });

    test("given ~/Documents/, when getting parent, then returns ~/", () => {
      expect(pathParent("~/Documents/")).toBe("~/");
    });

    test("given ~/Documents/file.ts, when getting parent, then returns ~/Documents/", () => {
      expect(pathParent("~/Documents/file.ts")).toBe("~/Documents/");
    });

    test("given /Users/john/Code, when getting parent, then returns /Users/john/", () => {
      expect(pathParent("/Users/john/Code")).toBe("/Users/john/");
    });
  });

  describe("pathFilter", () => {
    test("given /Users/, when getting filter, then returns empty", () => {
      expect(pathFilter("/Users/")).toBe("");
    });

    test("given /Users/jo, when getting filter, then returns jo", () => {
      expect(pathFilter("/Users/jo")).toBe("jo");
    });

    test("given /Us, when getting filter, then returns Us", () => {
      expect(pathFilter("/Us")).toBe("Us");
    });

    test("given /, when getting filter, then returns empty", () => {
      expect(pathFilter("/")).toBe("");
    });

    test("given ~/Doc, when getting filter, then returns Doc", () => {
      expect(pathFilter("~/Doc")).toBe("Doc");
    });
  });

  describe("normalizePath", () => {
    test("given double slashes, when normalizing, then collapses to single", () => {
      expect(normalizePath("//Users//john//")).toBe("/Users/john/");
    });

    test("given triple slashes, when normalizing, then collapses to single", () => {
      expect(normalizePath("///Users///")).toBe("/Users/");
    });

    test("given clean path, when normalizing, then returns unchanged", () => {
      expect(normalizePath("/Users/john/")).toBe("/Users/john/");
    });

    test("given ~/ prefix, when normalizing, then preserves it", () => {
      expect(normalizePath("~/Documents/")).toBe("~/Documents/");
    });
  });

  describe("navigation (right/left)", () => {
    test("given / and selecting Users/, when navigating right, then path becomes /Users/", () => {
      const token = "/";
      const base = pathBase(token);
      expect(normalizePath(base + "Users/")).toBe("/Users/");
    });

    test("given /Users/ and selecting john/, when navigating right, then path becomes /Users/john/", () => {
      const token = "/Users/";
      const base = pathBase(token);
      expect(normalizePath(base + "john/")).toBe("/Users/john/");
    });

    test("given /Users/john/ and navigating left, then path becomes /Users/", () => {
      expect(pathParent("/Users/john/")).toBe("/Users/");
    });

    test("given /Users/ and navigating left, then path becomes /", () => {
      expect(pathParent("/Users/")).toBe("/");
    });

    test("given / and navigating left, then returns null (cannot go higher)", () => {
      expect(pathParent("/")).toBeNull();
    });

    test("given ~/ and selecting Documents/, when navigating right, then path becomes ~/Documents/", () => {
      const token = "~/";
      const base = pathBase(token);
      expect(normalizePath(base + "Documents/")).toBe("~/Documents/");
    });

    test("given ~/Documents/ and navigating left, then path becomes ~/", () => {
      expect(pathParent("~/Documents/")).toBe("~/");
    });

    test("given ~/ and navigating left, then returns null", () => {
      expect(pathParent("~/")).toBeNull();
    });

    test("given ./ and selecting src/, when navigating right, then path becomes ./src/", () => {
      const token = "./";
      const base = pathBase(token);
      expect(normalizePath(base + "src/")).toBe("./src/");
    });

    test("given ./src/ and navigating left, then path becomes ./", () => {
      expect(pathParent("./src/")).toBe("./");
    });

    test("given ./ and navigating left, then returns null", () => {
      expect(pathParent("./")).toBeNull();
    });

    test("given /Users/john/Code/ and navigating left twice, then path becomes /Users/", () => {
      const first = pathParent("/Users/john/Code/");
      expect(first).toBe("/Users/john/");
      const second = pathParent(first!);
      expect(second).toBe("/Users/");
    });

    test("given full right-right-left sequence, then path resolves correctly", () => {
      let token = "/";
      token = normalizePath(pathBase(token) + "Users/");
      expect(token).toBe("/Users/");
      token = normalizePath(pathBase(token) + "john/");
      expect(token).toBe("/Users/john/");
      token = pathParent(token)!;
      expect(token).toBe("/Users/");
    });

    test("given file selection, when selecting file.ts, then path includes filename", () => {
      const token = "/Users/john/";
      const base = pathBase(token);
      expect(base + "file.ts").toBe("/Users/john/file.ts");
    });

    test("given filtered token /Users/jo, when selecting john/, then base preserves /Users/", () => {
      const token = "/Users/jo";
      const base = pathBase(token);
      expect(base).toBe("/Users/");
      expect(normalizePath(base + "john/")).toBe("/Users/john/");
    });
  });
});
