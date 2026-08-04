import { describe, expect, test } from "vitest";
import { tokenizeSearchQuery } from "../../src/lib/api/tokenize-search-query";

describe("tokenizeSearchQuery", () => {
  test("collapses repeated spaces between terms into a single split, with no empty tokens", () => {
    expect(tokenizeSearchQuery("coffee    cup")).toEqual(["coffee", "cup"]);
  });

  test("splits on non-space whitespace (tab) between terms", () => {
    expect(tokenizeSearchQuery("coffee\tcup")).toEqual(["coffee", "cup"]);
  });

  test("splits on non-space whitespace (newline) between terms", () => {
    expect(tokenizeSearchQuery("coffee\ncup")).toEqual(["coffee", "cup"]);
  });

  test("splits on mixed runs of different whitespace characters", () => {
    expect(tokenizeSearchQuery("coffee \t\n  cup")).toEqual(["coffee", "cup"]);
  });

  test("trims leading and trailing whitespace before tokenizing", () => {
    expect(tokenizeSearchQuery("  coffee    cup  ")).toEqual(["coffee", "cup"]);
  });

  test("returns a single-element array for a query with no whitespace", () => {
    expect(tokenizeSearchQuery("coffee")).toEqual(["coffee"]);
  });

  test("returns an empty array for an empty string", () => {
    expect(tokenizeSearchQuery("")).toEqual([]);
  });

  test("returns an empty array for a whitespace-only string", () => {
    expect(tokenizeSearchQuery("   ")).toEqual([]);
  });

  test("splits three or more terms with varying whitespace between each pair", () => {
    expect(tokenizeSearchQuery("aerosol   can   spray")).toEqual([
      "aerosol",
      "can",
      "spray",
    ]);
  });

  test("is deterministic across repeated calls on the same input", () => {
    const first = tokenizeSearchQuery("coffee    cup");
    const second = tokenizeSearchQuery("coffee    cup");
    expect(first).toEqual(["coffee", "cup"]);
    expect(second).toEqual(["coffee", "cup"]);
  });
});
