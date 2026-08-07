// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { getDb } from "@/lib/db";
import { computeCollectionRuleSet, type ZoneClassification } from "@/lib/schedule/rules";
import type { CollectionDayClassification } from "@/lib/schedule/collection-day";
import type { HolidayRecord } from "@/lib/schedule/holiday-shift";
import {
  collectNightlyDispatchCandidates,
  isRealCollectionDay,
  planDispatchForSubscription,
  tomorrowInNzAsUtcDate,
  type DispatchSubscription,
} from "@/lib/notifications/dispatcher";
import { setupTestDb, teardownTestDb } from "../helpers/api";

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

describe("tomorrowInNzAsUtcDate", () => {
  describe("realistic-scenario fixtures (6pm NZ invocation instants)", () => {
    test.each([
      ["2026-04-04T05:00:00Z", [2026, 4, 5]],
      ["2026-04-06T06:00:00Z", [2026, 4, 7]],
      ["2026-09-26T06:00:00Z", [2026, 9, 27]],
      ["2026-09-28T05:00:00Z", [2026, 9, 29]],
    ] as const)("%s -> %j", (instant, [year, month, day]) => {
      const result = tomorrowInNzAsUtcDate(new Date(instant));
      expect(result.getTime()).toBe(utcDate(year, month, day).getTime());
    });
  });

  describe("falsifying fixtures (straddling a DST transition near NZ midnight)", () => {
    test("2026-09-26T11:00:00Z (23:00 NZST) -> 2026-09-27, not one day early under a wrongly-assumed NZDT offset", () => {
      const result = tomorrowInNzAsUtcDate(new Date("2026-09-26T11:00:00Z"));
      expect(result.getTime()).toBe(utcDate(2026, 9, 27).getTime());
    });

    test("2026-04-04T11:30:00Z (00:30 NZDT on Apr 5) -> 2026-04-06, not one day early under a wrongly-assumed NZST offset", () => {
      const result = tomorrowInNzAsUtcDate(new Date("2026-04-04T11:30:00Z"));
      expect(result.getTime()).toBe(utcDate(2026, 4, 6).getTime());
    });
  });

  test("resolves NZ 'today' via an explicit Pacific/Auckland Intl timeZone, not local Date getters", () => {
    // Reassigning process.env.TZ mid-test does NOT work as a probe here: once
    // Node/V8 has read TZ once in this process (vitest.setup.ts's suite-wide
    // TZ=Pacific/Auckland pin, ADR 0017, does this before any test file
    // loads), local Date getters keep resolving against that original value
    // for the rest of the process's life — reassigning process.env.TZ later
    // has no effect on them. A local-Date-getter implementation of this
    // function therefore passes every fixture above AND a "set
    // process.env.TZ then assert" test unchanged, because the getters still
    // happen to agree with Pacific/Auckland. Spying on the constructor
    // instead proves the actual mechanism used: this function must reach
    // Intl.DateTimeFormat with an explicit `timeZone: "Pacific/Auckland"`
    // option, which is the one thing a local-getter or fixed-offset
    // implementation never does.
    const RealDateTimeFormat = Intl.DateTimeFormat;
    const spy = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation(function (
        this: unknown,
        ...args: ConstructorParameters<typeof Intl.DateTimeFormat>
      ) {
        return new RealDateTimeFormat(...args);
      } as unknown as typeof Intl.DateTimeFormat);

    try {
      const result = tomorrowInNzAsUtcDate(new Date("2026-09-26T06:00:00Z"));

      expect(spy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ timeZone: "Pacific/Auckland" }),
      );
      expect(result.getTime()).toBe(utcDate(2026, 9, 27).getTime());
    } finally {
      spy.mockRestore();
    }
  });
});

const SUBURBAN_ZONE: ZoneClassification = {
  zone: "zone-east",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
};

const INNER_CITY_ZONE: ZoneClassification = {
  zone: "zone-cbd",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
};

const NOW = new Date("2026-01-11T06:00:00Z"); // 19:00 NZDT on Jan 11 -> tomorrow = Jan 12

function subscriptionWith(overrides: Partial<DispatchSubscription>): DispatchSubscription {
  return {
    id: 1,
    endpoint: "https://push.example/one",
    p256dh: "p256dh-key",
    auth: "auth-secret",
    languagePreference: "en",
    zone: SUBURBAN_ZONE,
    collectionWeekday: 1, // Monday — matches NOW's tomorrow (2026-01-12)
    ...overrides,
  };
}

// New Year's Day 2026 is a Thursday; WCC shifts it 2 days to Saturday
// 2026-01-03 (matches db/seeds/03_holidays.js's confirmed real row).
const NEW_YEARS_2026: HolidayRecord = { date: "2026-01-01", shiftDays: 2 };

const THURSDAY_CLASSIFICATION: CollectionDayClassification = {
  isInnerCityNightCollection: false,
  collectionWeekday: 4,
};
const MONDAY_CLASSIFICATION: CollectionDayClassification = {
  isInnerCityNightCollection: false,
  collectionWeekday: 1,
};
const INNER_CITY_CLASSIFICATION: CollectionDayClassification = {
  isInnerCityNightCollection: true,
  collectionWeekday: null,
};

describe("isRealCollectionDay", () => {
  test("a suburban address's nominal weekday matching a listed holiday's own date is NOT a real collection day", () => {
    // Falsifiable: a plain isCollectionDay check (no holiday awareness)
    // would return true here — 2026-01-01 is a Thursday, matching
    // collectionWeekday 4. This assertion only passes with the fix.
    expect(
      isRealCollectionDay(THURSDAY_CLASSIFICATION, utcDate(2026, 1, 1), [NEW_YEARS_2026]),
    ).toBe(false);
  });

  test("the fully-resolved shifted date is a real collection day even though its own weekday doesn't nominally match", () => {
    // Falsifiable: a plain isCollectionDay check on 2026-01-03 (a Saturday,
    // weekday 6) against collectionWeekday 4 is false. This assertion only
    // passes with the fix.
    expect(
      isRealCollectionDay(THURSDAY_CLASSIFICATION, utcDate(2026, 1, 3), [NEW_YEARS_2026]),
    ).toBe(true);
  });

  test("a date unconnected to any holiday is unaffected — ordinary nominal match still returns true", () => {
    expect(
      isRealCollectionDay(MONDAY_CLASSIFICATION, utcDate(2026, 1, 12), [NEW_YEARS_2026]),
    ).toBe(true);
  });

  test("a date unconnected to any holiday still returns false on a genuine weekday mismatch", () => {
    expect(
      isRealCollectionDay(MONDAY_CLASSIFICATION, utcDate(2026, 1, 13), [NEW_YEARS_2026]),
    ).toBe(false);
  });

  test("an inner-city classification is always eligible, even on the holiday's own date (issue #185 scope)", () => {
    expect(
      isRealCollectionDay(INNER_CITY_CLASSIFICATION, utcDate(2026, 1, 1), [NEW_YEARS_2026]),
    ).toBe(true);
  });

  test("an empty holidays array behaves exactly like a plain nominal isCollectionDay check", () => {
    expect(isRealCollectionDay(THURSDAY_CLASSIFICATION, utcDate(2026, 1, 1), [])).toBe(true);
  });

  test("a two-hop holiday chain resolves correctly (ADR 0030)", () => {
    const chain: HolidayRecord[] = [
      { date: "2026-01-01", shiftDays: 1 },
      { date: "2026-01-02", shiftDays: 1 },
    ];

    expect(isRealCollectionDay(THURSDAY_CLASSIFICATION, utcDate(2026, 1, 3), chain)).toBe(true);
  });

  test("repeat calls are deterministic and never mutate the caller's holidays", () => {
    const holidays = [NEW_YEARS_2026];

    const resultA = isRealCollectionDay(THURSDAY_CLASSIFICATION, utcDate(2026, 1, 3), holidays);
    const resultB = isRealCollectionDay(THURSDAY_CLASSIFICATION, utcDate(2026, 1, 3), holidays);
    const resultC = isRealCollectionDay(THURSDAY_CLASSIFICATION, utcDate(2026, 1, 3), holidays);

    expect(resultA).toBe(true);
    expect(resultB).toBe(true);
    expect(resultC).toBe(true);
    expect(holidays).toEqual([NEW_YEARS_2026]);
  });
});

describe("planDispatchForSubscription", () => {
  test("suburban zone with a resolvable classification builds a payload with the correct ruleSet", () => {
    const subscription = subscriptionWith({ zone: SUBURBAN_ZONE });

    const result = planDispatchForSubscription(subscription, NOW);

    expect(result).not.toBeNull();
    const tomorrow = tomorrowInNzAsUtcDate(NOW);
    expect(result!.ruleSet).toEqual(computeCollectionRuleSet(SUBURBAN_ZONE, tomorrow));
    expect(result!.subscriptionId).toBe(subscription.id);
    expect(result!.collectionDate).toBe("2026-01-12");
  });

  test("inner-city zone with a resolvable classification builds a payload with the correct ruleSet", () => {
    const subscription = subscriptionWith({ zone: INNER_CITY_ZONE });

    const result = planDispatchForSubscription(subscription, NOW);

    expect(result).not.toBeNull();
    const tomorrow = tomorrowInNzAsUtcDate(NOW);
    expect(result!.ruleSet).toEqual(computeCollectionRuleSet(INNER_CITY_ZONE, tomorrow));
  });

  test("zone: null (no linked address) returns null", () => {
    const subscription = subscriptionWith({ zone: null });

    expect(planDispatchForSubscription(subscription, NOW)).toBeNull();
  });

  test("an empty/whitespace zone string returns null instead of throwing, without logging", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const subscription = subscriptionWith({
        zone: { zone: "   ", isInnerCityNightCollection: false, recyclingCalendarGroup: 1 },
      });

      expect(planDispatchForSubscription(subscription, NOW)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("a suburban zone with no resolvable recyclingCalendarGroup returns null and logs a [dispatcher] error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const subscription = subscriptionWith({
        zone: { zone: "zone-east", isInnerCityNightCollection: false, recyclingCalendarGroup: null },
      });

      expect(planDispatchForSubscription(subscription, NOW)).toBeNull();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining(`[dispatcher]`),
      );
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining(`${subscription.id}`),
      );
    } finally {
      spy.mockRestore();
    }
  });

  test("a suburban zone with no resolvable recyclingCalendarGroup logs again on every repeat call, not just once", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const subscription = subscriptionWith({
        zone: { zone: "zone-east", isInnerCityNightCollection: false, recyclingCalendarGroup: null },
      });

      expect(planDispatchForSubscription(subscription, NOW)).toBeNull();
      expect(planDispatchForSubscription(subscription, NOW)).toBeNull();

      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  test("a suburban zone whose confirmed collectionWeekday does NOT match tomorrow's NZ weekday returns null, without logging", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const subscription = subscriptionWith({ zone: SUBURBAN_ZONE, collectionWeekday: 3 });

      expect(planDispatchForSubscription(subscription, NOW)).toBeNull();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("a suburban zone whose confirmed collectionWeekday matches tomorrow's NZ weekday still builds a payload", () => {
    const subscription = subscriptionWith({ zone: SUBURBAN_ZONE, collectionWeekday: 1 });

    const result = planDispatchForSubscription(subscription, NOW);

    expect(result).not.toBeNull();
    expect(result!.collectionDate).toBe("2026-01-12");
  });

  test("an inner-city zone dispatches regardless of collectionWeekday (always eligible)", () => {
    const subscription = subscriptionWith({ zone: INNER_CITY_ZONE, collectionWeekday: null });

    expect(planDispatchForSubscription(subscription, NOW)).not.toBeNull();
  });

  test("a suburban zone with collectionWeekday: null (unconfirmed) returns null and logs a [dispatcher] error naming collectionWeekday", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const subscription = subscriptionWith({ zone: SUBURBAN_ZONE, collectionWeekday: null });

      expect(planDispatchForSubscription(subscription, NOW)).toBeNull();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining(`[dispatcher]`));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining(`collectionWeekday`));
      expect(spy).toHaveBeenCalledWith(expect.stringContaining(`${subscription.id}`));
    } finally {
      spy.mockRestore();
    }
  });

  test("a suburban zone with collectionWeekday: null logs again on every repeat call, not just once", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const subscription = subscriptionWith({ zone: SUBURBAN_ZONE, collectionWeekday: null });

      expect(planDispatchForSubscription(subscription, NOW)).toBeNull();
      expect(planDispatchForSubscription(subscription, NOW)).toBeNull();

      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  test("repeat calls with the same subscription and now return deep-equal but independently-mutable results", () => {
    const subscription = subscriptionWith({ zone: SUBURBAN_ZONE });

    const resultA = planDispatchForSubscription(subscription, NOW);
    const resultB = planDispatchForSubscription(subscription, NOW);

    expect(resultA).toEqual(resultB);
    expect(resultA!.ruleSet.binTypes).not.toBe(resultB!.ruleSet.binTypes);

    resultA!.ruleSet.binTypes.push("cardboard");

    const resultC = planDispatchForSubscription(subscription, NOW);
    expect(resultC!.ruleSet.binTypes).not.toContain("cardboard");
  });
});

describe("planDispatchForSubscription — holiday-shift awareness (issue #185)", () => {
  const NOW_HOLIDAY_EVE = new Date("2025-12-31T06:00:00Z"); // NZDT 19:00 Dec 31 -> tomorrow = 2026-01-01
  const NOW_SHIFT_EVE = new Date("2026-01-02T06:00:00Z"); // NZDT 19:00 Jan 2 -> tomorrow = 2026-01-03

  test("a suburban subscriber whose nominal weekday matches the holiday's own date gets no payload for the holiday date", () => {
    const subscription = subscriptionWith({ collectionWeekday: 4 });

    expect(
      planDispatchForSubscription(subscription, NOW_HOLIDAY_EVE, [NEW_YEARS_2026]),
    ).toBeNull();
  });

  test("without a holidays list (the default []), the same subscriber WOULD wrongly get a payload for the holiday date", () => {
    // Falsifying counterpart to the test above: same subscriber, same now,
    // only the holidays argument differs — proving the holidays argument
    // is what suppresses the wrong dispatch, not a coincidence.
    const subscription = subscriptionWith({ collectionWeekday: 4 });

    expect(planDispatchForSubscription(subscription, NOW_HOLIDAY_EVE)).not.toBeNull();
  });

  test("the same subscriber gets a payload for the real, shifted collection date", () => {
    const subscription = subscriptionWith({ collectionWeekday: 4 });

    const result = planDispatchForSubscription(subscription, NOW_SHIFT_EVE, [NEW_YEARS_2026]);

    expect(result).not.toBeNull();
    expect(result!.collectionDate).toBe("2026-01-03");
  });

  test("an inner-city subscriber still dispatches on the holiday's own date (holiday closures not modelled for inner-city, issue #185 scope)", () => {
    const subscription = subscriptionWith({ zone: INNER_CITY_ZONE, collectionWeekday: null });

    expect(
      planDispatchForSubscription(subscription, NOW_HOLIDAY_EVE, [NEW_YEARS_2026]),
    ).not.toBeNull();
  });

  test("repeat calls with the same subscription/now/holidays return deep-equal results and never mutate the holidays array", () => {
    const subscription = subscriptionWith({ collectionWeekday: 4 });
    const holidays = [NEW_YEARS_2026];

    const resultA = planDispatchForSubscription(subscription, NOW_SHIFT_EVE, holidays);
    const resultB = planDispatchForSubscription(subscription, NOW_SHIFT_EVE, holidays);

    expect(resultA).toEqual(resultB);
    expect(holidays).toEqual([NEW_YEARS_2026]);
  });
});

async function seedDispatchFixtures(): Promise<void> {
  const db = getDb();

  const [suburbanAddressId] = await db("addresses").insert({
    street_name: "Suburban Street",
    suburb: "Karori",
    zone: "zone-east",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 1,
    collection_weekday: 1, // Monday — matches NOW's tomorrow (2026-01-12)
  });

  const [suburbanCalendar2AddressId] = await db("addresses").insert({
    street_name: "Calendar Two Street",
    suburb: "Island Bay",
    zone: "zone-south",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 2,
    collection_weekday: 1,
  });

  const [innerCityAddressId] = await db("addresses").insert({
    street_name: "Cuba Street",
    suburb: "Te Aro",
    zone: "zone-cbd",
    is_inner_city_night_collection: true,
  });

  const [mismatchedWeekdayAddressId] = await db("addresses").insert({
    street_name: "Mismatched Weekday Street",
    suburb: "Brooklyn",
    zone: "zone-west",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 1,
    collection_weekday: 3, // Wednesday; tomorrow (fixed NOW) is Monday (1) — a genuine mismatch
  });

  const [unconfirmedWeekdayAddressId] = await db("addresses").insert({
    street_name: "Unconfirmed Weekday Street",
    suburb: "Kelburn",
    zone: "zone-west",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 1,
    collection_weekday: null,
  });

  await db("push_subscriptions").insert([
    {
      endpoint: "https://push.example/suburban",
      p256dh: "p256dh-suburban",
      auth: "auth-suburban",
      language_preference: "en",
      address_id: suburbanAddressId,
    },
    {
      endpoint: "https://push.example/suburban-calendar-2",
      p256dh: "p256dh-suburban-2",
      auth: "auth-suburban-2",
      language_preference: "en",
      address_id: suburbanCalendar2AddressId,
    },
    {
      endpoint: "https://push.example/inner-city",
      p256dh: "p256dh-inner-city",
      auth: "auth-inner-city",
      language_preference: "mi",
      address_id: innerCityAddressId,
    },
    {
      endpoint: "https://push.example/no-address",
      p256dh: "p256dh-no-address",
      auth: "auth-no-address",
      language_preference: "en",
      address_id: null,
    },
    {
      endpoint: "https://push.example/suburban-mismatched-weekday",
      p256dh: "p256dh-mismatched-weekday",
      auth: "auth-mismatched-weekday",
      language_preference: "en",
      address_id: mismatchedWeekdayAddressId,
    },
    {
      endpoint: "https://push.example/suburban-unconfirmed-weekday",
      p256dh: "p256dh-unconfirmed-weekday",
      auth: "auth-unconfirmed-weekday",
      language_preference: "en",
      address_id: unconfirmedWeekdayAddressId,
    },
  ]);
}

describe("collectNightlyDispatchCandidates", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    await setupTestDb();
    await seedDispatchFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(() => {
    // The seeded unconfirmed-weekday subscription logs a [dispatcher] error
    // on every call in this describe block; suppress it here so it doesn't
    // pollute every other test's output.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test("returns exactly the three eligible subscriptions' candidates, omitting the null-address, weekday-mismatched, and weekday-unconfirmed subscriptions", async () => {
    const candidates = await collectNightlyDispatchCandidates(NOW);

    expect(candidates).toHaveLength(3);

    const bySubscription = new Map(candidates.map((c) => [c.endpoint, c]));
    expect(bySubscription.has("https://push.example/no-address")).toBe(false);
    expect(bySubscription.has("https://push.example/suburban-mismatched-weekday")).toBe(false);
    expect(bySubscription.has("https://push.example/suburban-unconfirmed-weekday")).toBe(false);

    const suburban = bySubscription.get("https://push.example/suburban");
    expect(suburban?.ruleSet.collectionType).toBe("suburban-kerbside");

    const suburbanCalendar2 = bySubscription.get("https://push.example/suburban-calendar-2");
    expect(suburbanCalendar2?.ruleSet.collectionType).toBe("suburban-kerbside");

    const innerCity = bySubscription.get("https://push.example/inner-city");
    expect(innerCity?.ruleSet.collectionType).toBe("inner-city-night");
  });

  test("a suburban subscriber whose confirmed collection_weekday does not match tomorrow's weekday produces no dispatch candidate (issue #144)", async () => {
    const candidates = await collectNightlyDispatchCandidates(NOW);
    const endpoints = candidates.map((c) => c.endpoint);

    expect(endpoints).not.toContain("https://push.example/suburban-mismatched-weekday");
  });

  test("a suburban subscriber with an unconfirmed collection_weekday produces no dispatch candidate and logs a [dispatcher] error naming collectionWeekday (issue #144)", async () => {
    const candidates = await collectNightlyDispatchCandidates(NOW);
    const endpoints = candidates.map((c) => c.endpoint);

    expect(endpoints).not.toContain("https://push.example/suburban-unconfirmed-weekday");
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("collectionWeekday"));
  });

  test("resolves opposite recycling parity for two suburban subscriptions on different addresses.recycling_calendar_group (issue #102)", async () => {
    const candidates = await collectNightlyDispatchCandidates(NOW);
    const bySubscription = new Map(candidates.map((c) => [c.endpoint, c]));

    const calendar1 = bySubscription.get("https://push.example/suburban");
    const calendar2 = bySubscription.get("https://push.example/suburban-calendar-2");

    if (calendar1?.ruleSet.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    if (calendar2?.ruleSet.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(calendar1.ruleSet.recyclingType).not.toBe(calendar2.ruleSet.recyclingType);
  });

  test("rejects rather than resolving to [] when the query fails", async () => {
    await teardownTestDb();

    await expect(collectNightlyDispatchCandidates(NOW)).rejects.toThrow();

    // Restore for the next test in this file.
    await setupTestDb();
    await seedDispatchFixtures();
  });

  test("calling twice in a row with the same now returns deep-equal, element-by-element results", async () => {
    const first = await collectNightlyDispatchCandidates(NOW);
    const second = await collectNightlyDispatchCandidates(NOW);

    const sortByEndpoint = (a: { endpoint: string }, b: { endpoint: string }) =>
      a.endpoint.localeCompare(b.endpoint);

    expect([...first].sort(sortByEndpoint)).toEqual([...second].sort(sortByEndpoint));
  });
});

async function seedHolidayDispatchFixtures(): Promise<void> {
  const db = getDb();

  await db("holidays").insert({
    holiday_date: "2026-01-01",
    name_en: "New Year's Day",
    name_mi: "Te Rā Tau Hou",
    shift_days: 2,
  });

  const [thursdayAddressId] = await db("addresses").insert({
    street_name: "Thursday Suburban Street",
    suburb: "Karori",
    zone: "zone-east",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 1,
    collection_weekday: 4, // Thursday — matches New Year's Day's own weekday
  });

  const [mondayAddressId] = await db("addresses").insert({
    street_name: "Monday Suburban Street",
    suburb: "Island Bay",
    zone: "zone-south",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 1,
    collection_weekday: 1, // Monday — control, unconnected to the holiday
  });

  await db("push_subscriptions").insert([
    {
      endpoint: "https://push.example/thursday-suburban",
      p256dh: "p256dh-thursday-suburban",
      auth: "auth-thursday-suburban",
      language_preference: "en",
      address_id: thursdayAddressId,
    },
    {
      endpoint: "https://push.example/monday-suburban",
      p256dh: "p256dh-monday-suburban",
      auth: "auth-monday-suburban",
      language_preference: "en",
      address_id: mondayAddressId,
    },
  ]);
}

describe("collectNightlyDispatchCandidates — holiday-shift awareness (issue #185)", () => {
  const NOW_HOLIDAY_EVE = new Date("2025-12-31T06:00:00Z"); // NZDT 19:00 Dec 31 -> tomorrow = 2026-01-01
  const NOW_SHIFT_EVE = new Date("2026-01-02T06:00:00Z"); // NZDT 19:00 Jan 2 -> tomorrow = 2026-01-03
  const NOW_ORDINARY_THURSDAY_EVE = new Date("2026-01-14T06:00:00Z"); // NZDT 19:00 Jan 14 -> tomorrow = 2026-01-15

  beforeAll(async () => {
    await setupTestDb();
    await seedHolidayDispatchFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test("a Thursday-collection subscriber gets no dispatch candidate for the holiday's own date (2026-01-01)", async () => {
    const candidates = await collectNightlyDispatchCandidates(NOW_HOLIDAY_EVE);
    const endpoints = candidates.map((c) => c.endpoint);

    expect(endpoints).not.toContain("https://push.example/thursday-suburban");
    expect(endpoints).not.toContain("https://push.example/monday-suburban");
  });

  test("the same subscriber gets a dispatch candidate for the real, shifted collection date (2026-01-03), called twice with identical results", async () => {
    const first = await collectNightlyDispatchCandidates(NOW_SHIFT_EVE);
    const second = await collectNightlyDispatchCandidates(NOW_SHIFT_EVE);

    const sortByEndpoint = (a: { endpoint: string }, b: { endpoint: string }) =>
      a.endpoint.localeCompare(b.endpoint);
    expect([...first].sort(sortByEndpoint)).toEqual([...second].sort(sortByEndpoint));

    const thursday = first.find((c) => c.endpoint === "https://push.example/thursday-suburban");
    expect(thursday).toBeDefined();
    expect(thursday!.collectionDate).toBe("2026-01-03");

    expect(first.map((c) => c.endpoint)).not.toContain("https://push.example/monday-suburban");
  });

  test("a non-holiday week is unaffected — ordinary Thursday collection still dispatches normally", async () => {
    const candidates = await collectNightlyDispatchCandidates(NOW_ORDINARY_THURSDAY_EVE);

    const thursday = candidates.find(
      (c) => c.endpoint === "https://push.example/thursday-suburban",
    );
    expect(thursday).toBeDefined();
    expect(thursday!.collectionDate).toBe("2026-01-15");

    expect(candidates.map((c) => c.endpoint)).not.toContain(
      "https://push.example/monday-suburban",
    );
  });
});
