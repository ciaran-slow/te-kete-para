/**
 * Manual/on-demand accessibility-tree snapshot suite (ADR 0024, issue #18).
 *
 * Captures Chromium's computed accessibility tree — the same input
 * VoiceOver/TalkBack/NVDA/JAWS consume via their platform accessibility
 * APIs — as committed `.aria.yml` golden files, one per key state of each
 * shipped surface. The golden files are cross-checked by hand against
 * docs/qa/screen-reader-checklist.md.
 *
 * Deliberately NOT referenced by `test:e2e:a11y` or any CI-invoked script
 * (ADR 0024) — run it on demand via `npm run test:e2e:a11y-manual`.
 * Requires the `development` database to be migrated and seeded first:
 * `npm run migrate && npm run seed` (see the checklist's "How to reproduce
 * a pass" section). Query strings below ("Karori", "Cuba Street") come
 * from db/seeds/01_addresses.js — do not invent addresses not in the seed.
 */
import { test, expect, type Page } from "@playwright/test";

/* English UI strings from src/lib/i18n/dictionaries.ts. Every test starts
   from a fresh context (default locale "en"), so English is what renders. */
const SEARCH_LABEL = "Search for your street address";
const SCHEDULE_HEADING = "Today's collection";
const NO_RESULTS_TEXT =
  "No matching addresses. Check the spelling and try again.";
const SEARCH_ERROR_TEXT =
  "We couldn't search addresses right now. Please try again.";

function combobox(page: Page) {
  return page.getByRole("combobox", { name: SEARCH_LABEL });
}

/** Search-`query` → select `optionName` → wait for the schedule heading. */
async function selectAddress(page: Page, query: string, optionName: RegExp) {
  await combobox(page).fill(query);
  const option = page.getByRole("option", { name: optionName });
  await expect(option).toBeVisible();
  await option.click();
  await expect(
    page.getByRole("heading", { name: SCHEDULE_HEADING }),
  ).toBeVisible();
}

test.describe("manual screen-reader QA — accessibility-tree snapshots (ADR 0024)", () => {
  test("home page default state has the expected accessibility tree (en)", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toMatchAriaSnapshot({ name: "home-default-en.aria.yml" });
  });

  test("home page default state has the expected accessibility tree (mi)", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Te Reo Māori" }).click();
    await expect(page.getByTestId("app-description")).toContainText(
      "mō te para",
    );
    /* <html lang> mirroring is a document-level attribute the aria snapshot
       cannot carry — assert it directly (checklist: language toggle). */
    await expect(page.locator("html")).toHaveAttribute("lang", "mi");
    await expect(page).toMatchAriaSnapshot({ name: "home-default-mi.aria.yml" });
  });

  test("address search results are exposed correctly for a suburban address", async ({
    page,
  }) => {
    await page.goto("/");
    await combobox(page).fill("Karori");
    await expect(
      page.getByRole("option", { name: /Karori Road/ }),
    ).toBeVisible();
    await expect(page).toMatchAriaSnapshot({
      name: "address-search-results.aria.yml",
    });
  });

  test("address search no-results state is announced", async ({ page }) => {
    await page.goto("/");
    await combobox(page).fill("Nonexistent Street");
    await expect(page.getByText(NO_RESULTS_TEXT)).toBeVisible();
    await expect(page).toMatchAriaSnapshot({
      name: "address-search-no-results.aria.yml",
    });
  });

  test("address search surfaces an error state accessibly", async ({
    page,
  }) => {
    /* Failure path: force the client's error branch deterministically
       rather than trying to break the real database. */
    await page.route("**/api/suburbs/search*", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Unable to search addresses." },
      }),
    );
    await page.goto("/");
    await combobox(page).fill("Karori");
    await expect(page.getByText(SEARCH_ERROR_TEXT)).toBeVisible();
    await expect(page).toMatchAriaSnapshot({
      name: "address-search-error.aria.yml",
    });
  });

  test("schedule display shows suburban rules with correct live-region wiring", async ({
    page,
  }) => {
    await page.goto("/");
    await selectAddress(page, "Karori", /Karori Road/);
    await expect(page).toMatchAriaSnapshot({
      name: "schedule-suburban.aria.yml",
    });
  });

  test("schedule display shows inner-city night-collection rules", async ({
    page,
  }) => {
    await page.goto("/");
    await selectAddress(page, "Cuba Street", /Cuba Street/);
    await expect(page).toMatchAriaSnapshot({
      name: "schedule-inner-city.aria.yml",
    });
  });

  test("repeated capture of the same settled state is stable", async ({
    page,
  }) => {
    /* Proves the accessibility tree is deterministic across repeats, not
       just "the golden file matched once": the same settled state, reached
       from a fresh page load three times, must yield byte-identical trees. */
    const snapshots: string[] = [];
    for (let run = 0; run < 3; run += 1) {
      await page.goto("/");
      await selectAddress(page, "Karori", /Karori Road/);
      snapshots.push(await page.ariaSnapshot());
    }
    expect(snapshots[0]).toBe(snapshots[1]);
    expect(snapshots[1]).toBe(snapshots[2]);
  });
});
