import { expect, test } from "vitest";
import { en, mi } from "../../src/lib/i18n/dictionaries";
import { findKeyParityGaps } from "../helpers/i18n";

test("the detector reports a key missing from the second dictionary", () => {
  expect(findKeyParityGaps({ a: "1", b: "2" }, { a: "1" })).toEqual({
    missingInB: ["b"],
    missingInA: [],
  });
});

test("the detector reports a key missing from the first dictionary", () => {
  expect(findKeyParityGaps({ a: "1" }, { a: "1", extra: "2" })).toEqual({
    missingInB: [],
    missingInA: ["extra"],
  });
});

test("the detector reports drift in both directions at once", () => {
  expect(findKeyParityGaps({ only_a: "1" }, { only_b: "2" })).toEqual({
    missingInB: ["only_a"],
    missingInA: ["only_b"],
  });
});

test("en and mi dictionaries have 100% key parity (FR-01)", () => {
  expect(findKeyParityGaps(en, mi)).toEqual({ missingInB: [], missingInA: [] });
});

test("no translated value is empty or untranslated whitespace", () => {
  for (const [locale, dict] of Object.entries({ en, mi })) {
    for (const [key, value] of Object.entries(dict)) {
      expect(value.trim(), `${locale}.${key} is empty`).not.toBe("");
    }
  }
});
