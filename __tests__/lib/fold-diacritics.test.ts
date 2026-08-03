import { describe, expect, test } from "vitest";
import { foldDiacritics } from "../../src/lib/api/fold-diacritics";

describe("foldDiacritics", () => {
  test("strips a macron from a lower-case word", () => {
    expect(foldDiacritics("kēne")).toBe("kene");
  });

  test("strips macrons and folds case from an all-caps word", () => {
    expect(foldDiacritics("KĒNE")).toBe("kene");
  });

  test("strips a macron and folds case from a capitalised word", () => {
    expect(foldDiacritics("Kēne")).toBe("kene");
  });

  test("strips a macron from a word where it is not the first vowel", () => {
    expect(foldDiacritics("matūriki")).toBe("maturiki");
  });

  test("strips every macronised vowel, upper and lower case", () => {
    expect(foldDiacritics("Ā Ē Ī Ō Ū")).toBe("a e i o u");
  });

  test("returns an empty string unchanged", () => {
    expect(foldDiacritics("")).toBe("");
  });

  test("leaves LIKE wildcard and escape characters untouched", () => {
    expect(foldDiacritics("50% off_deal\\path")).toBe("50% off_deal\\path");
  });

  test("lower-cases plain ASCII text with no macrons", () => {
    expect(foldDiacritics("already ascii, no macrons")).toBe(
      "already ascii, no macrons",
    );
  });

  test("is idempotent: folding twice equals folding once", () => {
    const once = foldDiacritics("KĒNE");
    const twice = foldDiacritics(once);
    expect(once).toBe("kene");
    expect(twice).toBe("kene");
  });
});
