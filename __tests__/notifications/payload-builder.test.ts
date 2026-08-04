// @vitest-environment node
import { describe, expect, test } from "vitest";
import { dictionaries } from "@/lib/i18n/dictionaries";
import { computeCollectionRuleSet, type ZoneClassification } from "@/lib/schedule/rules";
import { buildLocalizedPushContent } from "@/lib/notifications/payload-builder";
import type { DispatchPayload } from "@/lib/notifications/dispatcher";

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const SUBURBAN_ZONE: ZoneClassification = {
  zone: "zone-east",
  isInnerCityNightCollection: false,
};

const INNER_CITY_ZONE: ZoneClassification = {
  zone: "zone-cbd",
  isInnerCityNightCollection: true,
};

const SUBURBAN_GLASS_WEEK_DATE = utcDate(2026, 1, 12);
const SUBURBAN_MIXED_WEEK_DATE = utcDate(2026, 1, 19);
const INNER_CITY_CARDBOARD_NIGHT_DATE = utcDate(2026, 1, 13); // Tuesday
const INNER_CITY_NON_CARDBOARD_NIGHT_DATE = utcDate(2026, 1, 14); // Wednesday

function buildPayload(overrides: Partial<DispatchPayload> & Pick<DispatchPayload, "languagePreference" | "ruleSet">): DispatchPayload {
  return {
    subscriptionId: 1,
    endpoint: "https://push.example/one",
    p256dh: "p256dh-key",
    auth: "auth-secret",
    collectionDate: "2026-01-12",
    ...overrides,
  };
}

describe("buildLocalizedPushContent", () => {
  test("suburban EN, glass week: renders EN bin names and put-out-by time", () => {
    const ruleSet = computeCollectionRuleSet(SUBURBAN_ZONE, SUBURBAN_GLASS_WEEK_DATE);
    const payload = buildPayload({ languagePreference: "en", ruleSet });

    const result = buildLocalizedPushContent(payload);

    expect(result.title).toBe(dictionaries.en["notification.collectionReminder.title"]);
    expect(result.body).toContain(dictionaries.en["schedule.binType.generalRubbish"]);
    expect(result.body).toContain(dictionaries.en["schedule.binType.glassRecycling"]);
    expect(result.body).toContain(dictionaries.en["schedule.putOutBy"]);
    expect(result.body).toContain("07:00");
  });

  test("suburban MI, mixed week: renders MI bin names and title", () => {
    const ruleSet = computeCollectionRuleSet(SUBURBAN_ZONE, SUBURBAN_MIXED_WEEK_DATE);
    const payload = buildPayload({ languagePreference: "mi", ruleSet });

    const result = buildLocalizedPushContent(payload);

    expect(result.title).toBe(dictionaries.mi["notification.collectionReminder.title"]);
    expect(result.body).toContain(dictionaries.mi["schedule.binType.mixedRecycling"]);
  });

  test("inner-city EN, cardboard night: renders EN yellow-bag and cardboard names plus the collection window", () => {
    const ruleSet = computeCollectionRuleSet(INNER_CITY_ZONE, INNER_CITY_CARDBOARD_NIGHT_DATE);
    const payload = buildPayload({ languagePreference: "en", ruleSet });

    const result = buildLocalizedPushContent(payload);

    expect(result.body).toContain(dictionaries.en["schedule.binType.yellowBagRubbish"]);
    expect(result.body).toContain(dictionaries.en["schedule.binType.cardboard"]);
    expect(result.body).toContain(dictionaries.en["schedule.collectionWindow"]);
    expect(result.body).toContain("17:30–22:00");
  });

  test("inner-city MI, non-cardboard night: renders MI yellow-bag name but not the MI cardboard name", () => {
    const ruleSet = computeCollectionRuleSet(INNER_CITY_ZONE, INNER_CITY_NON_CARDBOARD_NIGHT_DATE);
    const payload = buildPayload({ languagePreference: "mi", ruleSet });

    const result = buildLocalizedPushContent(payload);

    expect(result.body).toContain(dictionaries.mi["schedule.binType.yellowBagRubbish"]);
    expect(result.body).not.toContain(dictionaries.mi["schedule.binType.cardboard"]);
  });

  test("locale actually switches: EN and MI results differ for the same ruleSet", () => {
    const ruleSet = computeCollectionRuleSet(SUBURBAN_ZONE, SUBURBAN_GLASS_WEEK_DATE);
    const resultEn = buildLocalizedPushContent(buildPayload({ languagePreference: "en", ruleSet }));
    const resultMi = buildLocalizedPushContent(buildPayload({ languagePreference: "mi", ruleSet }));

    expect(resultEn.title).not.toBe(resultMi.title);
    expect(resultEn.body).not.toBe(resultMi.body);
  });

  test("repeat calls with the same payload return deep-equal results (pure-function determinism)", () => {
    const ruleSet = computeCollectionRuleSet(SUBURBAN_ZONE, SUBURBAN_GLASS_WEEK_DATE);
    const payload = buildPayload({ languagePreference: "en", ruleSet });

    const resultA = buildLocalizedPushContent(payload);
    const resultB = buildLocalizedPushContent(payload);

    expect(resultA).toEqual(resultB);
  });

  test.each([
    ["suburban EN, glass week", SUBURBAN_ZONE, SUBURBAN_GLASS_WEEK_DATE, "en" as const],
    ["suburban MI, mixed week", SUBURBAN_ZONE, SUBURBAN_MIXED_WEEK_DATE, "mi" as const],
    ["inner-city EN, cardboard night", INNER_CITY_ZONE, INNER_CITY_CARDBOARD_NIGHT_DATE, "en" as const],
    ["inner-city MI, non-cardboard night", INNER_CITY_ZONE, INNER_CITY_NON_CARDBOARD_NIGHT_DATE, "mi" as const],
  ])("shape: %s result has exactly title and body, both non-empty strings", (_label, zone, date, locale) => {
    const ruleSet = computeCollectionRuleSet(zone, date);
    const payload = buildPayload({ languagePreference: locale, ruleSet });

    const result = buildLocalizedPushContent(payload);

    expect(Object.keys(result).sort()).toEqual(["body", "title"]);
    expect(typeof result.title).toBe("string");
    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.body).toBe("string");
    expect(result.body.length).toBeGreaterThan(0);
  });
});
