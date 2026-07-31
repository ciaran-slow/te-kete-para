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
});
