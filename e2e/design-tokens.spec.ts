import { test, expect } from "@playwright/test";

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
    const uncovered = await page.evaluate(async () => {
      await document.fonts.ready;
      const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, "");
      const macrons = [..."āēīōūĀĒĪŌŪ"].map((c) => c.codePointAt(0) as number);
      const families = [
        getComputedStyle(document.body).fontFamily,
        getComputedStyle(document.querySelector("h1") as Element).fontFamily,
      ].map((f) => unquote(f.split(",")[0]));
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
      for (const family of families) {
        const familyFaces = faces.filter((f) => unquote(f.family) === family);
        if (familyFaces.length === 0) {
          missing.push(`${family}: no @font-face declared`);
          continue;
        }
        for (const cp of macrons) {
          if (!familyFaces.some((f) => covers(f, cp))) {
            missing.push(
              `${family}: U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
            );
          }
        }
      }
      return missing;
    });
    expect(uncovered).toEqual([]);
  });
});
