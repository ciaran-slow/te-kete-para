import { afterEach, beforeEach, expect, test } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Page from "../src/app/page";
import { LanguageProvider } from "../src/lib/i18n/language-provider";
import { LOCALE_STORAGE_KEY } from "../src/lib/i18n/locale-storage";
import { expectNoA11yViolations } from "./helpers/a11y";

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderPage() {
  return render(
    <LanguageProvider>
      <Page />
    </LanguageProvider>,
  );
}

test("renders the Te Kete Para heading", () => {
  renderPage();
  expect(
    screen.getByRole("heading", { level: 1, name: "Te Kete Para" }),
  ).toBeInTheDocument();
});

test("the tagline heading is English by default", () => {
  renderPage();
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "Protect the environment, take care of your waste.",
    }),
  ).toBeInTheDocument();
});

test("a stored Te Reo preference renders the Te Reo tagline heading", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "mi");
  renderPage();
  expect(
    screen.getByRole("heading", {
      level: 2,
      name: "Tiakina te taiao, kia mauria te para.",
    }),
  ).toBeInTheDocument();
});

test("the description paragraph is in English by default", () => {
  renderPage();
  expect(
    screen.getByText(
      "The bilingual rubbish and recycling companion for Wellington — Te Whanganui-a-Tara.",
    ),
  ).toBeInTheDocument();
});

test("a stored Te Reo preference renders the Te Reo description with its macron intact", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "mi");
  renderPage();
  const description = screen.getByText(
    "Te hoa reorua mō te para me te hangarua mō Te Whanganui-a-Tara.",
  );
  expect(description).toBeInTheDocument();
  expect(description.textContent).toContain("mō");
});

test("macron sample contains every macron vowel, upper and lower case", () => {
  renderPage();
  const sample = screen.getByTestId("macron-sample");
  for (const glyph of "āēīōūĀĒĪŌŪ") {
    expect(sample.textContent).toContain(glyph);
  }
});

test("the macron sample stays lang=mi regardless of the app locale", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "mi");
  renderPage();
  expect(screen.getByTestId("macron-sample")).toHaveAttribute("lang", "mi");
});

test("all three colour-token swatches render with their Māori names", () => {
  renderPage();
  const list = screen.getByRole("list", { name: "Wellington colour tokens" });
  const items = within(list).getAllByRole("listitem");
  expect(items.map((li) => li.textContent)).toEqual([
    "Kākāriki",
    "Moana",
    "Kōwhai",
  ]);
});

test("a semantic separator divides product copy from token diagnostics", () => {
  renderPage();
  expect(screen.getByRole("separator")).toBeInTheDocument();
});

test("homepage has no axe violations in English", async () => {
  const { container } = renderPage();
  await expectNoA11yViolations(container);
});

test("homepage has no axe violations in Te Reo", async () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "mi");
  const { container } = renderPage();
  await expectNoA11yViolations(container);
});
