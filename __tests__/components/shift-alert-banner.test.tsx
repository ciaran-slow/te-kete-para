import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import {
  ShiftAlertBanner,
  findUpcomingShift,
  LOOKAHEAD_DAYS,
  type HolidayApiRecord,
  type ShiftAlertBannerProps,
} from "../../src/components/shift-alert-banner";
import type { SuburbSearchResult } from "../../src/components/address-search";
import { LanguageProvider } from "../../src/lib/i18n/language-provider";
import { writeStoredLocale } from "../../src/lib/i18n/locale-storage";
import { expectNoA11yViolations } from "../helpers/a11y";

// collectionWeekday: 5 (Friday) — 2026-12-25 (CHRISTMAS/CHRISTMAS_DAY below)
// and 2026-01-01 (NEW_YEARS_CHAIN's first date) are Friday/Thursday
// respectively; this fixture's weekday is chosen to align with the holiday
// fixtures already used throughout this file, NOT with Karori Road's real
// seeded collection_weekday (3, Wednesday — db/seeds/01_addresses.js, ADR
// 0063). Don't assume this mirrors the real seed data.
const KARORI: SuburbSearchResult = {
  id: 10,
  streetName: "Karori Road",
  suburb: "Karori",
  zone: "SUBURBAN-WEST",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
  collectionWeekday: 5,
};
// Karori Road's REAL seeded collection_weekday (3, Wednesday) — reused here
// deliberately to prove that even the genuine value doesn't match Friday
// 2026-12-25, so the banner must show nothing for it.
const KARORI_WRONG_WEEKDAY: SuburbSearchResult = {
  ...KARORI,
  collectionWeekday: 3,
};
// An address whose collection weekday has not been confirmed yet (ADR
// 0063) — unreachable with today's fully-confirmed seed data, but the code
// must handle it: the banner must show nothing rather than guess.
const KARORI_UNCONFIRMED: SuburbSearchResult = {
  ...KARORI,
  collectionWeekday: null,
};
// A bulk-imported street (issue #178, ADR 0075) whose CBD/night-collection
// status hasn't been confirmed yet — isInnerCityNightCollection is
// genuinely null, not defaulted false.
const KARORI_UNCONFIRMED_CLASSIFICATION: SuburbSearchResult = {
  ...KARORI,
  isInnerCityNightCollection: null,
  collectionWeekday: null,
};
const CUBA_STREET: SuburbSearchResult = {
  id: 20,
  streetName: "Cuba Street",
  suburb: "Te Aro",
  zone: "CBD-INNER",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
  collectionWeekday: null,
};

const CHRISTMAS: HolidayApiRecord = {
  date: "2026-12-25",
  nameEn: "Christmas Day",
  nameMi: "Te Rā Kirihimete",
  shiftDays: 1,
};
// ADR 0030 chain fixture, reused from holiday-shift.test.ts's dates: Jan 1
// shifts to Jan 2, itself a listed holiday, so the chain resolves to Jan 3.
const NEW_YEARS_CHAIN: HolidayApiRecord[] = [
  {
    date: "2026-01-01",
    nameEn: "New Year's Day",
    nameMi: "Te Rā Tau Hou",
    shiftDays: 1,
  },
  {
    date: "2026-01-02",
    nameEn: "Day after New Year's Day",
    nameMi: "Te Rā i muri i te Tau Hou",
    shiftDays: 1,
  },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Mid-UTC-day so the viewer's local (Pacific/Auckland, ADR 0017) calendar
// date matches the UTC one — no day-rollover ambiguity, same technique as
// schedule-display.test.tsx.
const CHRISTMAS_DAY = new Date(Date.UTC(2026, 11, 25, 1));
// Six literal days before Christmas: the holiday is genuinely in the future
// (offset > 0), on the last day of the 7-day window. Literal, not derived
// from LOOKAHEAD_DAYS — see the window-pinning tests below.
const SIX_DAYS_BEFORE_CHRISTMAS = new Date(Date.UTC(2026, 11, 19, 1));
const MID_JUNE = new Date(Date.UTC(2026, 5, 15, 1));

const EN_CHRISTMAS_MESSAGE =
  "Your collection due 25/12/2026 (Christmas Day) shifts to 26/12/2026.";
const MI_CHRISTMAS_MESSAGE =
  "Tō kohinga e tika ana mō te 25/12/2026 (Te Rā Kirihimete) ka huri ki te 26/12/2026.";
const EN_ERROR_MESSAGE =
  "We couldn't check for upcoming collection changes right now. Please try again.";

// Classification fixtures for the pure findUpcomingShift tests below.
// FRIDAY/THURSDAY match CHRISTMAS's (2026-12-25) and NEW_YEARS_CHAIN[0]'s
// (2026-01-01) actual UTC weekdays respectively — verified via
// `new Date(Date.UTC(...)).getUTCDay()` before use, not assumed.
const FRIDAY_CLASSIFICATION = {
  isInnerCityNightCollection: false,
  collectionWeekday: 5 as const,
};
const THURSDAY_CLASSIFICATION = {
  isInnerCityNightCollection: false,
  collectionWeekday: 4 as const,
};
const WEDNESDAY_CLASSIFICATION = {
  isInnerCityNightCollection: false,
  collectionWeekday: 3 as const,
};
const UNCONFIRMED_CLASSIFICATION = {
  isInnerCityNightCollection: false,
  collectionWeekday: null,
};
const INNER_CITY_CLASSIFICATION = {
  isInnerCityNightCollection: true,
  collectionWeekday: null,
};

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 503, json: async () => body };
}

function renderBanner(props: ShiftAlertBannerProps) {
  return render(
    <LanguageProvider>
      <ShiftAlertBanner {...props} />
    </LanguageProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("findUpcomingShift", () => {
  test("finds a holiday exactly on todayUtc (offset 0)", () => {
    const result = findUpcomingShift(
      new Date(Date.UTC(2026, 11, 25)),
      [CHRISTMAS],
      FRIDAY_CLASSIFICATION,
    );

    expect(result).toEqual({
      holiday: CHRISTMAS,
      originalDate: "2026-12-25",
      shiftedDate: "2026-12-26",
    });
  });

  test("finds a holiday on the last day in the window (todayUtc + LOOKAHEAD_DAYS)", () => {
    const today = new Date(
      Date.UTC(2026, 11, 25) - LOOKAHEAD_DAYS * MS_PER_DAY,
    );

    const result = findUpcomingShift(today, [CHRISTMAS], FRIDAY_CLASSIFICATION);

    expect(result).toEqual({
      holiday: CHRISTMAS,
      originalDate: "2026-12-25",
      shiftedDate: "2026-12-26",
    });
  });

  test("does not find a holiday one day past the window (todayUtc + LOOKAHEAD_DAYS + 1)", () => {
    const today = new Date(
      Date.UTC(2026, 11, 25) - (LOOKAHEAD_DAYS + 1) * MS_PER_DAY,
    );

    expect(
      findUpcomingShift(today, [CHRISTMAS], FRIDAY_CLASSIFICATION),
    ).toBeNull();
  });

  // The three tests below pin ADR 0032's chosen window with literal dates —
  // deliberately NOT derived from LOOKAHEAD_DAYS, so silently changing the
  // constant (e.g. the today-only alternative ADR 0032 rejects) fails them
  // even though the relative boundary tests above would stay green.
  test("LOOKAHEAD_DAYS is exactly 6 (today + 6 = a 7-calendar-day window, ADR 0032)", () => {
    expect(LOOKAHEAD_DAYS).toBe(6);
  });

  test("finds a holiday six literal days ahead: today 2026-12-19, holiday 2026-12-25", () => {
    const result = findUpcomingShift(
      new Date(Date.UTC(2026, 11, 19)),
      [CHRISTMAS],
      FRIDAY_CLASSIFICATION,
    );

    expect(result).toEqual({
      holiday: CHRISTMAS,
      originalDate: "2026-12-25",
      shiftedDate: "2026-12-26",
    });
  });

  test("does not find a holiday seven literal days ahead: today 2026-12-18, holiday 2026-12-25", () => {
    expect(
      findUpcomingShift(
        new Date(Date.UTC(2026, 11, 18)),
        [CHRISTMAS],
        FRIDAY_CLASSIFICATION,
      ),
    ).toBeNull();
  });

  test("chained holidays resolve to the fully-shifted date (ADR 0030)", () => {
    const result = findUpcomingShift(
      new Date(Date.UTC(2026, 0, 1)),
      NEW_YEARS_CHAIN,
      THURSDAY_CLASSIFICATION,
    );

    expect(result).toEqual({
      holiday: NEW_YEARS_CHAIN[0],
      originalDate: "2026-01-01",
      shiftedDate: "2026-01-03",
    });
  });

  test("returns null for an empty holidays array", () => {
    expect(
      findUpcomingShift(new Date(Date.UTC(2026, 11, 25)), [], FRIDAY_CLASSIFICATION),
    ).toBeNull();
  });

  test("returns null when no holiday falls anywhere in the window", () => {
    expect(
      findUpcomingShift(
        new Date(Date.UTC(2026, 5, 15)),
        [CHRISTMAS],
        FRIDAY_CLASSIFICATION,
      ),
    ).toBeNull();
  });

  test("returns null when the holiday's date does not match the confirmed collectionWeekday", () => {
    // Same today/holidays as the offset-0 test above, but a classification
    // confirmed for Wednesday, not Friday: without the isCollectionDay gate
    // this would still return the Christmas shift, exactly like the old
    // (ADR 0053) behavior — this is what proves the fix.
    expect(
      findUpcomingShift(
        new Date(Date.UTC(2026, 11, 25)),
        [CHRISTMAS],
        WEDNESDAY_CLASSIFICATION,
      ),
    ).toBeNull();
  });

  test("returns null immediately for an unconfirmed suburban classification, even when a holiday genuinely falls in the window", () => {
    expect(
      findUpcomingShift(
        new Date(Date.UTC(2026, 11, 25)),
        [CHRISTMAS],
        UNCONFIRMED_CLASSIFICATION,
      ),
    ).toBeNull();
  });

  test("finds a holiday for an inner-city (every-night) classification regardless of collectionWeekday", () => {
    const result = findUpcomingShift(
      new Date(Date.UTC(2026, 11, 25)),
      [CHRISTMAS],
      INNER_CITY_CLASSIFICATION,
    );

    expect(result).toEqual({
      holiday: CHRISTMAS,
      originalDate: "2026-12-25",
      shiftedDate: "2026-12-26",
    });
  });

  test("repeat calls are deterministic and never mutate the caller's holidays", () => {
    const holidays = [...NEW_YEARS_CHAIN];
    const expected = {
      holiday: NEW_YEARS_CHAIN[0],
      originalDate: "2026-01-01",
      shiftedDate: "2026-01-03",
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      expect(
        findUpcomingShift(
          new Date(Date.UTC(2026, 0, 1)),
          holidays,
          THURSDAY_CLASSIFICATION,
        ),
      ).toEqual(expected);
    }

    expect(holidays).toEqual(NEW_YEARS_CHAIN);
  });
});

describe("ShiftAlertBanner", () => {
  test("with no address selected, renders no visible alert and never fetches", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const view = renderBanner({ address: null });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(view.container.textContent).toBe("");
  });

  test("with an address and an injected shift inside the window, shows the EN message and never fetches", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderBanner({
      address: KARORI,
      now: CHRISTMAS_DAY,
      holidays: [CHRISTMAS],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const message = screen.getByText(EN_CHRISTMAS_MESSAGE);
    // AC1's announcement mechanism (ADR 0021): the message must live inside
    // a polite, atomic live region — same assertions as its StatusRegion
    // peers (schedule-display.test.tsx, sorting-search.test.tsx).
    const liveRegion = message.closest("[aria-live]");
    expect(liveRegion).not.toBeNull();
    expect(liveRegion).toHaveAttribute("aria-live", "polite");
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
  });

  test("alerts proactively for a genuinely future holiday: now is 2026-12-19, holiday is 2026-12-25", () => {
    // AC1's "upcoming": every other visible-alert test uses now = the
    // holiday's own date (offset 0); this one renders the banner six days
    // early, which the today-only alternative ADR 0032 rejects would miss.
    renderBanner({
      address: KARORI,
      now: SIX_DAYS_BEFORE_CHRISTMAS,
      holidays: [CHRISTMAS],
    });

    expect(screen.getByText(EN_CHRISTMAS_MESSAGE)).toBeInTheDocument();
  });

  test("switching the stored locale to Te Reo renders the Māori holiday name and connective text", () => {
    renderBanner({
      address: KARORI,
      now: CHRISTMAS_DAY,
      holidays: [CHRISTMAS],
    });

    act(() => writeStoredLocale("mi"));

    expect(screen.getByText(MI_CHRISTMAS_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(EN_CHRISTMAS_MESSAGE)).not.toBeInTheDocument();
  });

  test("with an address and an injected holidays prop with no shift in range, renders no visible alert", () => {
    const view = renderBanner({
      address: KARORI,
      now: MID_JUNE,
      holidays: [CHRISTMAS],
    });

    expect(view.container.textContent).toBe("");
  });

  test("renders no visible alert when the holiday's date is confirmed NOT to be this address's real collection day", () => {
    const view = renderBanner({
      address: KARORI_WRONG_WEEKDAY,
      now: CHRISTMAS_DAY,
      holidays: [CHRISTMAS],
    });

    expect(view.container.textContent).toBe("");
  });

  test("renders no visible alert when the address's collection day is unconfirmed, even with a genuine holiday in range", () => {
    const view = renderBanner({
      address: KARORI_UNCONFIRMED,
      now: CHRISTMAS_DAY,
      holidays: [CHRISTMAS],
    });

    expect(view.container.textContent).toBe("");
  });

  test("renders no visible alert for an address with isInnerCityNightCollection: null (bulk-imported, unconfirmed), even with a genuine holiday in range (issue #178)", () => {
    const view = renderBanner({
      address: KARORI_UNCONFIRMED_CLASSIFICATION,
      now: CHRISTMAS_DAY,
      holidays: [CHRISTMAS],
    });

    expect(view.container.textContent).toBe("");
  });

  test("fetches GET /api/holidays exactly once when an address is selected and no override is given, then shows the resulting alert", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ results: [CHRISTMAS] }));
    vi.stubGlobal("fetch", fetchMock);

    renderBanner({ address: KARORI, now: CHRISTMAS_DAY });

    expect(await screen.findByText(EN_CHRISTMAS_MESSAGE)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/holidays",
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  test("reselecting the same address (new object, same id) does not re-fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ results: [CHRISTMAS] }));
    vi.stubGlobal("fetch", fetchMock);

    const view = renderBanner({ address: KARORI, now: CHRISTMAS_DAY });
    await screen.findByText(EN_CHRISTMAS_MESSAGE);

    view.rerender(
      <LanguageProvider>
        <ShiftAlertBanner address={{ ...KARORI }} now={CHRISTMAS_DAY} />
      </LanguageProvider>,
    );
    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(EN_CHRISTMAS_MESSAGE)).toBeInTheDocument();
  });

  test("switching to a different address fetches again and does not leave a stale alert from the previous address visible", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [CHRISTMAS] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const view = renderBanner({ address: KARORI, now: CHRISTMAS_DAY });
    await screen.findByText(EN_CHRISTMAS_MESSAGE);

    view.rerender(
      <LanguageProvider>
        <ShiftAlertBanner address={CUBA_STREET} now={CHRISTMAS_DAY} />
      </LanguageProvider>,
    );

    await waitFor(() =>
      expect(screen.queryByText(EN_CHRISTMAS_MESSAGE)).not.toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("a failed fetch shows the translated error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: "Unable to load public holidays." }, false)),
    );

    renderBanner({ address: KARORI, now: CHRISTMAS_DAY });

    expect(await screen.findByText(EN_ERROR_MESSAGE)).toBeInTheDocument();
  });

  test("a rejected fetch (network failure) shows the same translated error message, consistently across two separate renders", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const first = renderBanner({ address: KARORI, now: CHRISTMAS_DAY });
    expect(await screen.findByText(EN_ERROR_MESSAGE)).toBeInTheDocument();
    first.unmount();

    renderBanner({ address: KARORI, now: CHRISTMAS_DAY });
    expect(await screen.findByText(EN_ERROR_MESSAGE)).toBeInTheDocument();
  });

  test("an injected holidays entry computeHolidayShift rejects shows the translated error message", () => {
    // Defensive path only — real /api/holidays rows always pass
    // computeHolidayShift's validation ("2026-13-01" cannot exist in a
    // seeded holidays table).
    renderBanner({
      address: KARORI,
      now: CHRISTMAS_DAY,
      holidays: [
        { date: "2026-13-01", nameEn: "Bad", nameMi: "Bad", shiftDays: 1 },
      ],
    });

    expect(screen.getByText(EN_ERROR_MESSAGE)).toBeInTheDocument();
  });

  test("unmounting while a fetch is pending aborts it and does not update state after unmount", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveFetch: ((value: unknown) => void) | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise((resolve, reject) => {
        resolveFetch = resolve;
        // Mirror real fetch: an aborted request rejects with an AbortError.
        (init?.signal as AbortSignal).addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = renderBanner({ address: KARORI, now: CHRISTMAS_DAY });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const signal = fetchMock.mock.calls[0]![1]!.signal as AbortSignal;
    expect(signal.aborted).toBe(false);

    view.unmount();
    expect(signal.aborted).toBe(true);

    // Settling the promise after unmount must not update state, warn, or
    // throw.
    await act(async () => {
      resolveFetch?.(jsonResponse({ results: [CHRISTMAS] }));
    });

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test("passes the accessibility audit in the empty, visible-alert, and error states", async () => {
    const empty = renderBanner({ address: null });
    await expectNoA11yViolations(empty.container);
    cleanup();

    const visible = renderBanner({
      address: KARORI,
      now: CHRISTMAS_DAY,
      holidays: [CHRISTMAS],
    });
    await expectNoA11yViolations(visible.container);
    cleanup();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    const errorView = renderBanner({ address: KARORI, now: CHRISTMAS_DAY });
    await screen.findByText(EN_ERROR_MESSAGE);
    await expectNoA11yViolations(errorView.container);
  });
});
