import { test, expect } from "@playwright/test";

test("homepage renders its top-level heading", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Te Kete Para" }),
  ).toBeVisible();
});
