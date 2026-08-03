import { expect, test } from "vitest";
import manifest from "../src/app/manifest";

test("the manifest carries the product name, short name, and bilingual description", () => {
  const result = manifest();
  expect(result.name).toBe("Te Kete Para");
  expect(result.short_name).toBe("Kete Para");
  expect(result.description).toContain("Te Whanganui-a-Tara");
});

test("theme and background colours are pinned to the literal Moana/Papa hex values", () => {
  const result = manifest();
  expect(result.theme_color).toBe("#003b46");
  expect(result.background_color).toBe("#f8fafc");
});

test("the app installs standalone, starting at the root route", () => {
  const result = manifest();
  expect(result.display).toBe("standalone");
  expect(result.start_url).toBe("/");
});

test("icons are the exact two-entry any/maskable SVG set", () => {
  const result = manifest();
  expect(result.icons).toEqual([
    {
      src: "/icons/icon.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "any",
    },
    {
      src: "/icons/icon-maskable.svg",
      sizes: "any",
      type: "image/svg+xml",
      purpose: "maskable",
    },
  ]);
});

test("manifest() is pure — repeated calls deep-equal", () => {
  expect(manifest()).toEqual(manifest());
});
