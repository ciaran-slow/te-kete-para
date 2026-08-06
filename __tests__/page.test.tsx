import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Page from "../src/app/page";
import { LanguageProvider } from "../src/lib/i18n/language-provider";
import { LOCALE_STORAGE_KEY } from "../src/lib/i18n/locale-storage";
import type { SuburbSearchResult } from "../src/components/address-search";
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

test("the schedule panel prompts for an address by default", () => {
  renderPage();
  expect(
    screen.getByText(
      "Search for your address above to see your next collection.",
    ),
  ).toBeInTheDocument();
});

test("a stored Te Reo preference renders the Te Reo schedule prompt", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "mi");
  renderPage();
  expect(
    screen.getByText(
      "Rapua tō wāhitau i runga ake nei kia kite i tō kohinga e whai ake nei.",
    ),
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

test("a semantic separator divides the address schedule from the sorting search", () => {
  renderPage();
  expect(screen.getAllByRole("separator").length).toBeGreaterThanOrEqual(1);
});

test("the sorting search section is composed onto the homepage (issue #75, ADR 0064)", () => {
  renderPage();
  expect(
    screen.getByRole("heading", { level: 2, name: "What is this?" }),
  ).toBeInTheDocument();
  expect(
    screen.getByLabelText("Search for a household item"),
  ).toBeInTheDocument();
});

test("a stored Te Reo preference renders the Te Reo sorting search heading", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "mi");
  renderPage();
  expect(
    screen.getByRole("heading", { level: 2, name: "He Aha Tēnei?" }),
  ).toBeInTheDocument();
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

const KARORI: SuburbSearchResult = {
  id: 1,
  streetName: "Karori Road",
  suburb: "Karori",
  zone: "SUBURBAN-WEST",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
  collectionWeekday: 3,
};

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

test("selecting an address fetches GET /api/holidays in addition to rendering today's schedule (ShiftAlertBanner composed into AddressSchedule, issue #83)", async () => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = input.toString();
    if (url.includes("/api/suburbs/search")) {
      return Promise.resolve(jsonResponse({ results: [KARORI] }));
    }
    if (url.includes("/api/holidays")) {
      return Promise.resolve(jsonResponse({ results: [] }));
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  renderPage();
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "Karori" },
  });
  const option = await screen.findByRole("option", { name: /Karori Road/ });
  fireEvent.click(option);

  await screen.findByRole("heading", { name: "Your next collection" });
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/holidays",
    expect.anything(),
  );

  vi.unstubAllGlobals();
});
