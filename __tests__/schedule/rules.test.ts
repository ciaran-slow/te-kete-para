import { describe, expect, test } from "vitest";
import {
  computeCollectionRuleSet,
  type ZoneClassification,
} from "../../src/lib/schedule/rules";

const SUBURBAN: ZoneClassification = {
  zone: "zone-east",
  isInnerCityNightCollection: false,
};

const INNER_CITY: ZoneClassification = {
  zone: "zone-cbd",
  isInnerCityNightCollection: true,
};

describe("computeCollectionRuleSet", () => {
  test("suburban zone on the epoch Monday gets a glass-week kerbside rule set", () => {
    const result = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 1)),
    );

    expect(result.collectionType).toBe("suburban-kerbside");
    expect(result.zone).toBe("zone-east");
    expect(result.timeWindow).toEqual({ start: "07:00", end: null });
    if (result.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(result.isRecyclingWeek).toBe(true);
    expect(result.recyclingType).toBe("glass");
    expect(result.binTypes).toEqual(["general-rubbish", "glass-recycling"]);
  });

  test("suburban zone one week after the epoch alternates to a mixed week", () => {
    const result = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 8)),
    );

    if (result.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(result.recyclingType).toBe("mixed");
    expect(result.binTypes).toEqual(["general-rubbish", "mixed-recycling"]);
  });

  test("the alternating-week boundary flips between Sunday day 7 and Monday day 8", () => {
    const sundayEndOfEpochWeek = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 7)),
    );
    const mondayOfNextWeek = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 8)),
    );

    if (sundayEndOfEpochWeek.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    if (mondayOfNextWeek.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(sundayEndOfEpochWeek.recyclingType).toBe("glass");
    expect(mondayOfNextWeek.recyclingType).toBe("mixed");
  });

  test("the alternation is periodic: two weeks after the epoch is glass again", () => {
    const result = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 15)),
    );

    if (result.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(result.recyclingType).toBe("glass");
  });

  test("inner-city zone on a Tuesday gets a cardboard night collection", () => {
    const result = computeCollectionRuleSet(
      INNER_CITY,
      new Date(Date.UTC(2024, 0, 2)),
    );

    expect(result.collectionType).toBe("inner-city-night");
    expect(result.zone).toBe("zone-cbd");
    expect(result.timeWindow).toEqual({ start: "17:30", end: "22:00" });
    if (result.collectionType !== "inner-city-night") {
      throw new Error("expected an inner-city rule set");
    }
    expect(result.isCardboardNight).toBe(true);
    expect(result.binTypes).toEqual(["yellow-bag-rubbish", "cardboard"]);
  });

  test("inner-city zone on a non-Tuesday has no cardboard collection", () => {
    const result = computeCollectionRuleSet(
      INNER_CITY,
      new Date(Date.UTC(2024, 0, 3)),
    );

    if (result.collectionType !== "inner-city-night") {
      throw new Error("expected an inner-city rule set");
    }
    expect(result.isCardboardNight).toBe(false);
    expect(result.binTypes).toEqual(["yellow-bag-rubbish"]);
  });

  test("only the UTC calendar date is read, never wall-clock time", () => {
    const lateInUtcDay = computeCollectionRuleSet(
      INNER_CITY,
      new Date("2024-01-01T23:00:00Z"),
    );
    const utcMidnight = computeCollectionRuleSet(
      INNER_CITY,
      new Date(Date.UTC(2024, 0, 1)),
    );

    expect(lateInUtcDay).toEqual(utcMidnight);

    const suburbanLateInUtcDay = computeCollectionRuleSet(
      SUBURBAN,
      new Date("2024-01-01T23:00:00Z"),
    );
    const suburbanUtcMidnight = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 1)),
    );

    expect(suburbanLateInUtcDay).toEqual(suburbanUtcMidnight);
  });

  test("an invalid date throws a RangeError, identically on repeat calls", () => {
    const invalidDate = new Date("not-a-date");

    expect(() => computeCollectionRuleSet(SUBURBAN, invalidDate)).toThrow(
      new RangeError("computeCollectionRuleSet: date is invalid."),
    );
    expect(() => computeCollectionRuleSet(SUBURBAN, invalidDate)).toThrow(
      new RangeError("computeCollectionRuleSet: date is invalid."),
    );
  });

  test("an empty zone string throws a RangeError, identically on repeat calls", () => {
    const blankZone: ZoneClassification = {
      zone: "   ",
      isInnerCityNightCollection: false,
    };
    const validDate = new Date(Date.UTC(2024, 0, 1));

    expect(() => computeCollectionRuleSet(blankZone, validDate)).toThrow(
      new RangeError("computeCollectionRuleSet: zone must be a non-empty string."),
    );
    expect(() => computeCollectionRuleSet(blankZone, validDate)).toThrow(
      new RangeError("computeCollectionRuleSet: zone must be a non-empty string."),
    );
  });

  test("repeat calls return equal but independent results with no shared mutable state", () => {
    const resultA = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 1)),
    );
    const resultB = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 1)),
    );

    expect(resultA).toEqual(resultB);
    expect(resultA.binTypes).not.toBe(resultB.binTypes);

    resultA.binTypes.push("cardboard");

    const resultC = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2024, 0, 1)),
    );
    expect(resultC.binTypes).toEqual(["general-rubbish", "glass-recycling"]);
  });
});
