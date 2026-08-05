import { test, expect } from "@playwright/test";
import { expectNoA11yViolations } from "./helpers/axe";

/* One top-level page/route exists today: "/" (src/app/page.tsx). Add a
   `test.describe` block here for every new top-level route (#17 AC1) —
   don't fold new routes into this one just because it's the only file. */
test.describe("home page (/) — axe a11y suite", () => {
  test("has no axe violations in English", async ({ page }) => {
    await page.goto("/");
    await expectNoA11yViolations(page);
  });

  test("has no axe violations in Te Reo Māori", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("radio", { name: "Te Reo Māori" }).click();
    await expect(page.getByTestId("app-description")).toContainText(
      "mō te para",
    );
    await expectNoA11yViolations(page);
  });

  test("switching languages repeatedly still has no axe violations", async ({
    page,
  }) => {
    await page.goto("/");
    const en = page.getByRole("radio", { name: "English" });
    const mi = page.getByRole("radio", { name: "Te Reo Māori" });
    await mi.click();
    await expectNoA11yViolations(page);
    await en.click();
    await expectNoA11yViolations(page);
    await mi.click();
    await expect(page.getByTestId("app-description")).toContainText(
      "mō te para",
    );
    await expectNoA11yViolations(page);
  });

  test.describe("with an upcoming shift alert visible (issue #83, ADR 0053)", () => {
    test.use({ timezoneId: "Pacific/Auckland" });

    test.beforeEach(async ({ page }) => {
      await page.route("**/api/suburbs/search*", (route) =>
        route.fulfill({
          json: {
            results: [
              {
                id: 1,
                streetName: "Test Street",
                suburb: "Test Suburb",
                zone: "SUBURBAN-WEST",
                isInnerCityNightCollection: false,
                recyclingCalendarGroup: 1,
              },
            ],
          },
        }),
      );
      await page.route("**/api/holidays*", (route) =>
        route.fulfill({
          json: {
            results: [
              {
                date: "2026-12-25",
                nameEn: "Christmas Day",
                nameMi: "Te Rā Kirihimete",
                shiftDays: 1,
              },
            ],
          },
        }),
      );
      // Mid-UTC-day so the viewer's local (Pacific/Auckland) calendar date
      // is unambiguously 2026-12-25, same technique as PINNED_SCHEDULE_TIME
      // in manual-screen-reader-tree.spec.ts.
      await page.clock.setFixedTime(new Date("2026-12-25T10:00:00+13:00"));
    });

    async function selectTestAddress(page: import("@playwright/test").Page) {
      // Locale-independent: the combobox's accessible name is itself
      // localized (address.search.label), so match by role only — there is
      // exactly one combobox on the page.
      await page.getByRole("combobox").fill("Test");
      const option = page.getByRole("option", { name: /Test Street/ });
      await expect(option).toBeVisible();
      await option.click();
    }

    test("has no axe violations with the shift alert visible in English", async ({
      page,
    }) => {
      await page.goto("/");
      await selectTestAddress(page);
      await expect(
        page.getByText(
          "Collections normally due 25/12/2026 (Christmas Day) move to 26/12/2026.",
        ),
      ).toBeVisible();
      await expectNoA11yViolations(page);
    });

    test("has no axe violations with the shift alert visible in Te Reo Māori", async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("radio", { name: "Te Reo Māori" }).click();
      await selectTestAddress(page);
      await expect(
        page.getByText(
          "Ko ngā kohinga e tika ana mō te 25/12/2026 (Te Rā Kirihimete) ka huri ki te 26/12/2026.",
        ),
      ).toBeVisible();
      await expectNoA11yViolations(page);
    });
  });
});
