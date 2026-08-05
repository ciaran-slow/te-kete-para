// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { getDb } from "@/lib/db";
import { computeCollectionRuleSet, type ZoneClassification } from "@/lib/schedule/rules";
import {
  collectNightlyDispatchCandidates,
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
    ...overrides,
  };
}

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

async function seedDispatchFixtures(): Promise<void> {
  const db = getDb();

  const [suburbanAddressId] = await db("addresses").insert({
    street_name: "Suburban Street",
    suburb: "Karori",
    zone: "zone-east",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 1,
  });

  const [suburbanCalendar2AddressId] = await db("addresses").insert({
    street_name: "Calendar Two Street",
    suburb: "Island Bay",
    zone: "zone-south",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 2,
  });

  const [innerCityAddressId] = await db("addresses").insert({
    street_name: "Cuba Street",
    suburb: "Te Aro",
    zone: "zone-cbd",
    is_inner_city_night_collection: true,
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
  ]);
}

describe("collectNightlyDispatchCandidates", () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedDispatchFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test("returns exactly the three linked subscriptions' candidates, omitting the null-address subscription", async () => {
    const candidates = await collectNightlyDispatchCandidates(NOW);

    expect(candidates).toHaveLength(3);

    const bySubscription = new Map(candidates.map((c) => [c.endpoint, c]));
    expect(bySubscription.has("https://push.example/no-address")).toBe(false);

    const suburban = bySubscription.get("https://push.example/suburban");
    expect(suburban?.ruleSet.collectionType).toBe("suburban-kerbside");

    const suburbanCalendar2 = bySubscription.get("https://push.example/suburban-calendar-2");
    expect(suburbanCalendar2?.ruleSet.collectionType).toBe("suburban-kerbside");

    const innerCity = bySubscription.get("https://push.example/inner-city");
    expect(innerCity?.ruleSet.collectionType).toBe("inner-city-night");
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
