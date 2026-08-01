import { test, expect } from "@playwright/test";
import { expectNoA11yViolations } from "./helpers/axe";

/* Each fixture is a complete minimal document (lang, <title>, <main>, <h1>)
   rather than the bare fragment the jsdom harness uses: unlike the jsdom
   helper (ADR 0007), this tier audits the whole document with no rules
   disabled, so document-level rules (`html-has-lang`, `document-title`,
   `page-has-heading-one`) fire on a bare `page.setContent` fragment and
   would drown out the one rule each fixture is designed to isolate. */
const wrapFixture = (body: string): string =>
  `<html lang="mi"><head><title>Whakamātau</title></head><body><main><h1>Tauira</h1>${body}</main></body></html>`;

test.describe("expectNoA11yViolations (Playwright/axe-core helper)", () => {
  test("accessible markup passes the audit", async ({ page }) => {
    await page.setContent(
      wrapFixture(`<button type="button">Tāpiri</button>`),
    );
    await expectNoA11yViolations(page);
  });

  test("a button with no accessible name fails with the rule id", async ({
    page,
  }) => {
    await page.setContent(wrapFixture(`<button type="button"></button>`));
    await expect(expectNoA11yViolations(page)).rejects.toThrow(/button-name/);
  });

  test("every violation is reported, not just the first", async ({
    page,
  }) => {
    await page.setContent(
      wrapFixture(`<button type="button"></button><input type="text" />`),
    );
    const message = await expectNoA11yViolations(page).then(
      () => {
        throw new Error("expected the audit to fail");
      },
      (error: Error) => error.message,
    );
    expect(message).toMatch(/button-name/);
    expect(message).toMatch(/\blabel\b/);
    expect(message).toMatch(/found 2/);
  });

  // The one rule the jsdom helper (ADR 0007) cannot compute at all — this is
  // the acceptance criterion "contrast ratios verified against 4.5:1" made
  // concrete rather than assumed.
  test("a low-contrast text/background pair fails color-contrast", async ({
    page,
  }) => {
    await page.setContent(
      wrapFixture(
        `<p style="color:#dddddd;background-color:#ffffff;">Low contrast copy</p>`,
      ),
    );
    await expect(expectNoA11yViolations(page)).rejects.toThrow(
      /color-contrast/,
    );
  });

  test("repeat audits of a passing page keep passing", async ({ page }) => {
    await page.setContent(wrapFixture(`<button type="button">Pai</button>`));
    await expectNoA11yViolations(page);
    await expectNoA11yViolations(page);
    await expectNoA11yViolations(page);
  });

  test("repeat audits of a failing page fail identically", async ({
    page,
  }) => {
    await page.setContent(wrapFixture(`<button type="button"></button>`));
    await expect(expectNoA11yViolations(page)).rejects.toThrow(/button-name/);
    await expect(expectNoA11yViolations(page)).rejects.toThrow(/button-name/);
  });
});
