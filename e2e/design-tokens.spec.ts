import { test, expect } from "@playwright/test";

/* Runs inside the browser via page.evaluate — jsdom component tests never
   load real fonts (vitest.setup.ts has no CSS import), so this is the only
   tier that can prove a selector's *resolved* font-family actually covers
   every macron code point rather than silently falling back to a system
   font (ADR 0005, #9). Selectors are checked by their own computed
   font-family rather than assumed from "body" or "h1" alone, so this
   generalizes explicitly to every text location audited, not just the two
   the original spec happened to sample. */
async function uncoveredMacronGlyphs(selectors: string[]): Promise<string[]> {
  await document.fonts.ready;
  const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");
  const macrons = [..."āēīōūĀĒĪŌŪ"].map((c) => c.codePointAt(0) as number);
  const covers = (face: FontFace, cp: number) =>
    face.unicodeRange.split(/,\s*/).some((range) => {
      const m = range.match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
      if (!m) return false;
      const lo = parseInt(m[1].replace(/\?/g, "0"), 16);
      const hi = m[1].includes("?")
        ? parseInt(m[1].replace(/\?/g, "F"), 16)
        : m[2]
          ? parseInt(m[2], 16)
          : lo;
      return cp >= lo && cp <= hi;
    });
  const faces = Array.from(document.fonts);
  const missing: string[] = [];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) {
      missing.push(`${selector}: not found`);
      continue;
    }
    const family = unquote(getComputedStyle(el).fontFamily.split(",")[0]);
    const familyFaces = faces.filter((f) => unquote(f.family) === family);
    if (familyFaces.length === 0) {
      missing.push(`${selector} (${family}): no @font-face declared`);
      continue;
    }
    for (const cp of macrons) {
      if (!familyFaces.some((f) => covers(f, cp))) {
        missing.push(
          `${selector} (${family}): U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        );
      }
    }
  }
  return missing;
}

test.describe("Wellington design tokens", () => {
  test("colour tokens compile to utilities and reach the page", async ({
    page,
  }) => {
    await page.goto("/");
    const body = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(body.background).toBe("rgb(248, 250, 252)"); // papa #f8fafc
    expect(body.color).toBe("rgb(15, 23, 42)"); // papa-ink #0f172a

    const h1Color = await page
      .locator("h1")
      .evaluate((el) => getComputedStyle(el).color);
    expect(h1Color).toBe("rgb(0, 59, 70)"); // moana #003b46

    const swatchBackgrounds = await page
      .getByRole("list", { name: "Wellington colour tokens" })
      .getByRole("listitem")
      .evaluateAll((els) =>
        els.map((el) => getComputedStyle(el).backgroundColor),
      );
    expect(swatchBackgrounds).toEqual([
      "rgb(27, 77, 62)", // kakariki #1b4d3e
      "rgb(0, 59, 70)", // moana #003b46
      "rgb(180, 83, 9)", // kowhai #b45309
    ]);
  });

  test("body uses Inter and headings use Plus Jakarta Sans", async ({
    page,
  }) => {
    await page.goto("/");
    const bodyFamily = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily,
    );
    expect(bodyFamily).toMatch(/Inter/);
    const h1Family = await page
      .locator("h1")
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(h1Family).toMatch(/Plus[_ ]Jakarta[_ ]Sans/);
  });

  test("both font families declare coverage for every macron glyph", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("macron-sample")).toContainText(
      "āēīōū ĀĒĪŌŪ",
    );
    const uncovered = await page.evaluate(uncoveredMacronGlyphs, [
      "body",
      "h1",
    ]);
    expect(uncovered).toEqual([]);
  });

  test("the Te Reo description renders with its macron intact, in a font that covers it", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Te Reo Māori" }).click();
    await expect(page.getByTestId("app-description")).toContainText(
      "mō te para",
    );
    const uncovered = await page.evaluate(uncoveredMacronGlyphs, [
      '[data-testid="app-description"]',
    ]);
    expect(uncovered).toEqual([]);
  });

  /* vision.md §3 / issue #15 (ADR 0020): the browser tier resolves what
     jsdom cannot — var(--color-moana) to its rgb value and the 3rem floor
     to a painted >= 48px box. The keyboard/mouse :focus-visible gating and
     the authored declaration values are asserted under jsdom in
     __tests__/a11y/focus-and-touch-targets.test.tsx. */
  test("tabbing onto the language toggle then the search input shows the resolved 3px solid moana ring with 2px offset", async ({
    page,
  }) => {
    await page.goto("/");

    const resolvedRing = (el: Element) => {
      const s = getComputedStyle(el);
      return {
        width: s.outlineWidth,
        style: s.outlineStyle,
        color: s.outlineColor,
        offset: s.outlineOffset,
      };
    };
    const moanaRing = {
      width: "3px",
      style: "solid",
      color: "rgb(0, 59, 70)", // moana #003b46, resolved from var(--color-moana)
      offset: "2px",
    };

    // First Tab stop is the header's radiogroup; Radix's roving focus hands
    // the entry focus to the checked item.
    await page.keyboard.press("Tab");
    const en = page.getByRole("radio", { name: "English" });
    await expect(en).toBeFocused();
    expect(await en.evaluate(resolvedRing)).toEqual(moanaRing);

    // Second Tab leaves the radiogroup (no focus trap) for the combobox.
    await page.keyboard.press("Tab");
    const input = page.getByRole("combobox");
    await expect(input).toBeFocused();
    expect(await input.evaluate(resolvedRing)).toEqual(moanaRing);
  });

  test("clicking a language radio focuses it without showing the ring", async ({
    page,
  }) => {
    await page.goto("/");
    const mi = page.getByRole("radio", { name: "Te Reo Māori" });
    await mi.click();
    await expect(mi).toBeFocused();
    expect(await mi.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
      "none",
    );
  });

  test("both language radios and the search input paint at least 48x48px", async ({
    page,
  }) => {
    await page.goto("/");
    for (const locator of [
      page.getByRole("radio", { name: "English" }),
      page.getByRole("radio", { name: "Te Reo Māori" }),
      page.getByRole("combobox"),
    ]) {
      const box = await locator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThanOrEqual(48);
      expect(box!.height).toBeGreaterThanOrEqual(48);
    }
  });

  test("switching languages repeatedly still renders the Māori description with its macron intact", async ({
    page,
  }) => {
    await page.goto("/");
    const en = page.getByRole("radio", { name: "English" });
    const mi = page.getByRole("radio", { name: "Te Reo Māori" });
    await mi.click();
    await en.click();
    await mi.click();
    await expect(page.getByTestId("app-description")).toContainText(
      "mō te para",
    );
    const uncovered = await page.evaluate(uncoveredMacronGlyphs, [
      '[data-testid="app-description"]',
    ]);
    expect(uncovered).toEqual([]);
  });
});
