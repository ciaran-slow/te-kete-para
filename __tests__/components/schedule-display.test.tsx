import { afterEach, describe, expect, test } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  ScheduleDisplay,
  formatUtcCalendarDate,
  todayAsUtcCalendarDate,
} from "../../src/components/schedule-display";
import type { SuburbSearchResult } from "../../src/components/address-search";
import { LanguageProvider } from "../../src/lib/i18n/language-provider";
import { writeStoredLocale } from "../../src/lib/i18n/locale-storage";
import { expectNoA11yViolations } from "../helpers/a11y";

const SUBURBAN_ADDRESS: SuburbSearchResult = {
  id: 10,
  streetName: "Karori Road",
  suburb: "Karori",
  zone: "SUBURBAN-WEST",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
};
const INNER_CITY_ADDRESS: SuburbSearchResult = {
  id: 20,
  streetName: "Cuba Street",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
};
// Defensive/failure-path fixture only — real /api/suburbs/search results
// never have a blank zone.
const BLANK_ZONE_ADDRESS: SuburbSearchResult = {
  id: 30,
  streetName: "Nowhere Street",
  suburb: "Nowhere",
  zone: "   ",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
};
// A real, valid suburban address whose recyclingCalendarGroup has not yet
// been confirmed against WCC's per-street tool (ADR 0059's known gap) —
// unlike BLANK_ZONE_ADDRESS above, this shape is reachable from real
// /api/suburbs/search data.
const UNCONFIRMED_CALENDAR_ADDRESS: SuburbSearchResult = {
  id: 40,
  streetName: "New Street",
  suburb: "Newtown",
  zone: "SUBURBAN-SOUTH",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: null,
};

// Matches rules.test.ts's epoch fixture: a glass week, mid-UTC-day so the
// viewer's local (Pacific/Auckland, ADR 0017) calendar date is also
// 2026-01-12 — no day-rollover ambiguity in these four.
const GLASS_WEEK_MONDAY = new Date(Date.UTC(2026, 0, 12, 1));
const CARDBOARD_TUESDAY = new Date(Date.UTC(2026, 0, 13, 1));
const NON_CARDBOARD_WEDNESDAY = new Date(Date.UTC(2026, 0, 14, 1));
// One week past the epoch = week 1 = the *mixed* half of the alternating
// cycle (rules.ts). Suburban addresses spend half the year in this state, so
// it needs its own assertion: without one, a wrong BIN_TYPE_KEYS entry for
// "mixed-recycling" is invisible to both `tsc` (the wrong key is still a
// valid TranslationKey) and the whole suite.
const MIXED_WEEK_MONDAY = new Date(Date.UTC(2026, 0, 19, 1));

function renderDisplay(address: SuburbSearchResult | null, now?: Date) {
  return render(
    <LanguageProvider>
      <ScheduleDisplay address={address} now={now} />
    </LanguageProvider>,
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ScheduleDisplay", () => {
  test("with no address selected, prompts inside a polite atomic live region with no aria-labelledby", () => {
    renderDisplay(null);
    const prompt = screen.getByText(
      "Search for your address above to see today's collection.",
    );
    const section = prompt.closest("section");
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute("aria-live", "polite");
    expect(section).toHaveAttribute("aria-atomic", "true");
    expect(section).not.toHaveAttribute("aria-labelledby");
  });

  test("suburban address on a glass week shows today's date, both bins in order, and the put-out time", () => {
    renderDisplay(SUBURBAN_ADDRESS, GLASS_WEEK_MONDAY);

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "Today's collection",
    });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute("aria-labelledby", heading.id);

    expect(screen.getByText("12/01/2026")).toBeInTheDocument();

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "General rubbish",
      "Glass recycling crate",
    ]);

    expect(screen.getByText("Put out by 07:00")).toBeInTheDocument();
  });

  test("suburban address on a mixed week shows the mixed-recycling bin, not the glass crate", () => {
    renderDisplay(SUBURBAN_ADDRESS, MIXED_WEEK_MONDAY);

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "General rubbish",
      "Mixed recycling (paper, plastic, metal)",
    ]);
    expect(screen.queryByText("Glass recycling crate")).not.toBeInTheDocument();

    expect(screen.getByText("19/01/2026")).toBeInTheDocument();
    expect(screen.getByText("Put out by 07:00")).toBeInTheDocument();
  });

  test("inner-city address on a Tuesday shows the yellow bag, cardboard, and the night collection window", () => {
    renderDisplay(INNER_CITY_ADDRESS, CARDBOARD_TUESDAY);

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "Yellow rubbish bag",
      "Cardboard",
    ]);

    expect(
      screen.getByText("Collection window: 17:30–22:00"),
    ).toBeInTheDocument();
  });

  test("inner-city address on a non-Tuesday shows only the yellow bag, no cardboard", () => {
    renderDisplay(INNER_CITY_ADDRESS, NON_CARDBOARD_WEDNESDAY);

    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Yellow rubbish bag"]);
    expect(screen.queryByText("Cardboard")).not.toBeInTheDocument();
  });

  test("switching the stored locale to Te Reo renders the Māori schedule strings", () => {
    renderDisplay(SUBURBAN_ADDRESS, GLASS_WEEK_MONDAY);

    act(() => writeStoredLocale("mi"));

    expect(
      screen.getByRole("heading", { level: 2, name: "Te kohinga o tēnei rā" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Para Whānui")).toBeInTheDocument();
    expect(screen.getByText("Kete Karāhe")).toBeInTheDocument();
    expect(
      screen.getByText("Whakaputahia i mua i te 07:00"),
    ).toBeInTheDocument();
  });

  test("a malformed (blank) zone shows the translated error instead of crashing", () => {
    expect(() =>
      renderDisplay(BLANK_ZONE_ADDRESS, GLASS_WEEK_MONDAY),
    ).not.toThrow();

    expect(
      screen.getByText(
        "We couldn't work out today's collection for this address. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.queryByText(
        "We haven't confirmed this address's recycling calendar yet. Check back soon.",
      ),
    ).not.toBeInTheDocument();
  });

  test("a suburban address with an unconfirmed recyclingCalendarGroup shows a specific message, not the generic error", () => {
    renderDisplay(UNCONFIRMED_CALENDAR_ADDRESS, GLASS_WEEK_MONDAY);

    expect(
      screen.getByText(
        "We haven't confirmed this address's recycling calendar yet. Check back soon.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        "We couldn't work out today's collection for this address. Please try again.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  test("repeated address changes never leave stale content behind", () => {
    const view = renderDisplay(null);
    const display = (address: SuburbSearchResult | null) =>
      view.rerender(
        <LanguageProvider>
          <ScheduleDisplay address={address} now={GLASS_WEEK_MONDAY} />
        </LanguageProvider>,
      );

    // null → suburban
    display(SUBURBAN_ADDRESS);
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["General rubbish", "Glass recycling crate"]);
    expect(
      screen.queryByText(
        "Search for your address above to see today's collection.",
      ),
    ).not.toBeInTheDocument();

    // suburban → inner-city
    display(INNER_CITY_ADDRESS);
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["Yellow rubbish bag"]);
    expect(screen.queryByText("General rubbish")).not.toBeInTheDocument();

    // inner-city → null
    display(null);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(
      screen.queryByRole("heading", { level: 2 }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Search for your address above to see today's collection.",
      ),
    ).toBeInTheDocument();

    // null → suburban again
    display(SUBURBAN_ADDRESS);
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["General rubbish", "Glass recycling crate"]);
    expect(
      screen.getAllByRole("heading", { level: 2, name: "Today's collection" }),
    ).toHaveLength(1);

    // suburban → unconfirmed calendar group
    display(UNCONFIRMED_CALENDAR_ADDRESS);
    expect(
      screen.getByText(
        "We haven't confirmed this address's recycling calendar yet. Check back soon.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.queryByText("General rubbish")).not.toBeInTheDocument();

    // unconfirmed calendar group → suburban again
    display(SUBURBAN_ADDRESS);
    expect(
      screen.getAllByRole("listitem").map((li) => li.textContent),
    ).toEqual(["General rubbish", "Glass recycling crate"]);
    expect(
      screen.queryByText(
        "We haven't confirmed this address's recycling calendar yet. Check back soon.",
      ),
    ).not.toBeInTheDocument();
  });

  describe("todayAsUtcCalendarDate", () => {
    test("is idempotent for the same input", () => {
      const first = todayAsUtcCalendarDate(GLASS_WEEK_MONDAY);
      const second = todayAsUtcCalendarDate(GLASS_WEEK_MONDAY);
      expect(first.getTime()).toBe(second.getTime());
    });

    test("uses the viewer's local calendar day, not the UTC one", () => {
      // 23:00 UTC on Jan 1 = Jan 2, 12:00 in Pacific/Auckland (UTC+13 in
      // January, pinned suite-wide by ADR 0017). Local getters must win.
      const lateUtcEvening = new Date("2024-01-01T23:00:00Z");
      expect(todayAsUtcCalendarDate(lateUtcEvening).getTime()).toBe(
        Date.UTC(2024, 0, 2),
      );
    });
  });

  test("formatUtcCalendarDate zero-pads single-digit day and month", () => {
    expect(formatUtcCalendarDate(new Date(Date.UTC(2024, 0, 1)))).toBe(
      "01/01/2024",
    );
  });

  test("passes the accessibility audit in the empty, suburban, inner-city, and unconfirmed-calendar-group states", async () => {
    const empty = renderDisplay(null);
    await expectNoA11yViolations(empty.container);
    cleanup();

    const suburban = renderDisplay(SUBURBAN_ADDRESS, GLASS_WEEK_MONDAY);
    await expectNoA11yViolations(suburban.container);
    cleanup();

    const innerCity = renderDisplay(INNER_CITY_ADDRESS, CARDBOARD_TUESDAY);
    await expectNoA11yViolations(innerCity.container);
    cleanup();

    const unconfirmed = renderDisplay(UNCONFIRMED_CALENDAR_ADDRESS, GLASS_WEEK_MONDAY);
    await expectNoA11yViolations(unconfirmed.container);
  });
});
