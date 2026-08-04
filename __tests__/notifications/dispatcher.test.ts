// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test } from "vitest";
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

  test("is independent of the host process's TZ (rules out the local-Date-getter shortcut)", () => {
    const original = process.env.TZ;
    process.env.TZ = "UTC";
    try {
      const result = tomorrowInNzAsUtcDate(new Date("2026-09-26T06:00:00Z"));
      expect(result.getTime()).toBe(utcDate(2026, 9, 27).getTime());
    } finally {
      process.env.TZ = original;
    }
  });
});

const SUBURBAN_ZONE: ZoneClassification = {
  zone: "zone-east",
  isInnerCityNightCollection: false,
};

const INNER_CITY_ZONE: ZoneClassification = {
  zone: "zone-cbd",
  isInnerCityNightCollection: true,
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

  test("an empty/whitespace zone string returns null instead of throwing", () => {
    const subscription = subscriptionWith({
      zone: { zone: "   ", isInnerCityNightCollection: false },
    });

    expect(planDispatchForSubscription(subscription, NOW)).toBeNull();
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

  test("returns exactly the two linked subscriptions' candidates, omitting the null-address subscription", async () => {
    const candidates = await collectNightlyDispatchCandidates(NOW);

    expect(candidates).toHaveLength(2);

    const bySubscription = new Map(candidates.map((c) => [c.endpoint, c]));
    expect(bySubscription.has("https://push.example/no-address")).toBe(false);

    const suburban = bySubscription.get("https://push.example/suburban");
    expect(suburban?.ruleSet.collectionType).toBe("suburban-kerbside");

    const innerCity = bySubscription.get("https://push.example/inner-city");
    expect(innerCity?.ruleSet.collectionType).toBe("inner-city-night");
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
