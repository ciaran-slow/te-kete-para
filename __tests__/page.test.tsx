import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Page from "../src/app/page";
import { expectNoA11yViolations } from "./helpers/a11y";

// @testing-library/react's auto-cleanup only registers itself when `afterEach`
// is a global at module-load time; this repo's vitest.config.mts doesn't set
// test.globals, so repeated render() calls in one file would otherwise pile
// up in the DOM across tests.
afterEach(cleanup);

test("renders the Te Kete Para heading", () => {
  render(<Page />);
  expect(
    screen.getByRole("heading", { level: 1, name: "Te Kete Para" }),
  ).toBeInTheDocument();
});

test("macron sample contains every macron vowel, upper and lower case", () => {
  render(<Page />);
  const sample = screen.getByTestId("macron-sample");
  for (const glyph of "āēīōūĀĒĪŌŪ") {
    expect(sample.textContent).toContain(glyph);
  }
});

test("Te Reo copy is marked lang=mi", () => {
  render(<Page />);
  expect(
    screen.getByText("Tiakina te taiao, kia mauria te para."),
  ).toHaveAttribute("lang", "mi");
  expect(screen.getByTestId("macron-sample")).toHaveAttribute("lang", "mi");
});

test("all three colour-token swatches render with their Māori names", () => {
  render(<Page />);
  const list = screen.getByRole("list", { name: "Wellington colour tokens" });
  const items = within(list).getAllByRole("listitem");
  expect(items.map((li) => li.textContent)).toEqual([
    "Kākāriki",
    "Moana",
    "Kōwhai",
  ]);
});

test("a semantic separator divides product copy from token diagnostics", () => {
  render(<Page />);
  expect(screen.getByRole("separator")).toBeInTheDocument();
});

test("homepage has no axe violations", async () => {
  const { container } = render(<Page />);
  await expectNoA11yViolations(container);
});
