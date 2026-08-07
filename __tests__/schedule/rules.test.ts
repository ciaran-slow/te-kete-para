import { describe, expect, test } from "vitest";
import {
  computeCollectionRuleSet,
  UnresolvedRecyclingCalendarGroupError,
  UnresolvedZoneClassificationError,
  type ZoneClassification,
} from "../../src/lib/schedule/rules";

const SUBURBAN: ZoneClassification = {
  zone: "zone-east",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
};

const SUBURBAN_CALENDAR_2: ZoneClassification = {
  zone: "zone-south",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 2,
};

const INNER_CITY: ZoneClassification = {
  zone: "zone-cbd",
  isInnerCityNightCollection: true,
  recyclingCalendarGroup: null,
};

describe("computeCollectionRuleSet", () => {
  test("suburban zone on the epoch Monday gets a glass-week kerbside rule set", () => {
    const result = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2026, 0, 12)),
    );

    expect(result.collectionType).toBe("suburban-kerbside");
    expect(result.zone).toBe("zone-east");
    expect(result.timeWindow).toEqual({ start: "07:00", end: null });
    if (result.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(result.recyclingType).toBe("glass");
    expect(result.binTypes).toEqual(["yellow-bag-rubbish", "glass-recycling"]);
  });

  test("suburban zone one week after the epoch alternates to a mixed week", () => {
    const result = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2026, 0, 19)),
    );

    if (result.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(result.recyclingType).toBe("mixed");
    expect(result.binTypes).toEqual(["yellow-bag-rubbish", "mixed-recycling"]);
  });

  test("the alternating-week boundary flips between Sunday day 7 and Monday day 8", () => {
    const sundayEndOfEpochWeek = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2026, 0, 18)),
    );
    const mondayOfNextWeek = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2026, 0, 19)),
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
      new Date(Date.UTC(2026, 0, 26)),
    );

    if (result.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(result.recyclingType).toBe("glass");
  });

  test("inner-city zone on a Tuesday gets a cardboard night collection", () => {
    const result = computeCollectionRuleSet(
      INNER_CITY,
      new Date(Date.UTC(2026, 0, 13)),
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
      new Date(Date.UTC(2026, 0, 14)),
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
      new Date("2026-01-12T23:00:00Z"),
    );
    const utcMidnight = computeCollectionRuleSet(
      INNER_CITY,
      new Date(Date.UTC(2026, 0, 12)),
    );

    expect(lateInUtcDay).toEqual(utcMidnight);

    const suburbanLateInUtcDay = computeCollectionRuleSet(
      SUBURBAN,
      new Date("2026-01-12T23:00:00Z"),
    );
    const suburbanUtcMidnight = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2026, 0, 12)),
    );

    expect(suburbanLateInUtcDay).toEqual(suburbanUtcMidnight);
  });

  test("the recycling week is read from the UTC calendar date, not the local one, across a week boundary", () => {
    // 2026-01-18T23:00:00Z is Sunday in UTC (end of the epoch's glass week,
    // so still "glass"), but Monday 12:00 in Pacific/Auckland (UTC+13,
    // pinned suite-wide by ADR 0017) — the start of the next ("mixed")
    // week. Every other UTC-contract fixture in this file is either exact
    // UTC midnight or falls in the same epoch week under both readings, so
    // none of them can catch a getUTCFullYear/getUTCMonth/getUTCDate ->
    // local-getter regression in the recycling-week arithmetic. This one
    // can: a local-getter regression here computes "mixed" instead.
    const result = computeCollectionRuleSet(
      SUBURBAN,
      new Date("2026-01-18T23:00:00Z"),
    );
    if (result.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    expect(result.recyclingType).toBe("glass");
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
      recyclingCalendarGroup: 1,
    };
    const validDate = new Date(Date.UTC(2026, 0, 12));

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
      new Date(Date.UTC(2026, 0, 12)),
    );
    const resultB = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2026, 0, 12)),
    );

    expect(resultA).toEqual(resultB);
    expect(resultA.binTypes).not.toBe(resultB.binTypes);

    resultA.binTypes.push("cardboard");

    const resultC = computeCollectionRuleSet(
      SUBURBAN,
      new Date(Date.UTC(2026, 0, 12)),
    );
    expect(resultC.binTypes).toEqual(["yellow-bag-rubbish", "glass-recycling"]);
  });

  test("a Calendar 2 suburban zone is the exact inverse of Calendar 1 on the same dates", () => {
    const epochMonday = computeCollectionRuleSet(
      SUBURBAN_CALENDAR_2,
      new Date(Date.UTC(2026, 0, 12)),
    );
    const nextMonday = computeCollectionRuleSet(
      SUBURBAN_CALENDAR_2,
      new Date(Date.UTC(2026, 0, 19)),
    );

    if (epochMonday.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    if (nextMonday.collectionType !== "suburban-kerbside") {
      throw new Error("expected a suburban rule set");
    }
    // Calendar 1 (SUBURBAN) is glass on 2026-01-12 and mixed on 2026-01-19 —
    // Calendar 2 must read the opposite on both dates.
    expect(epochMonday.recyclingType).toBe("mixed");
    expect(nextMonday.recyclingType).toBe("glass");
  });

  test("a suburban zone with no recyclingCalendarGroup throws a RangeError, identically on repeat calls", () => {
    const noGroup: ZoneClassification = {
      zone: "zone-east",
      isInnerCityNightCollection: false,
      recyclingCalendarGroup: null,
    };
    const validDate = new Date(Date.UTC(2026, 0, 12));

    expect(() => computeCollectionRuleSet(noGroup, validDate)).toThrow(
      new UnresolvedRecyclingCalendarGroupError(),
    );
    expect(() => computeCollectionRuleSet(noGroup, validDate)).toThrow(
      new UnresolvedRecyclingCalendarGroupError(),
    );
    expect(() => computeCollectionRuleSet(noGroup, validDate)).toThrow(
      UnresolvedRecyclingCalendarGroupError,
    );
  });

  test("a zone with isInnerCityNightCollection null throws UnresolvedZoneClassificationError, identically on repeat calls", () => {
    const unresolved: ZoneClassification = {
      zone: "zone-unconfirmed",
      isInnerCityNightCollection: null,
      recyclingCalendarGroup: null,
    };
    const validDate = new Date(Date.UTC(2026, 0, 12));

    expect(() => computeCollectionRuleSet(unresolved, validDate)).toThrow(
      new UnresolvedZoneClassificationError("computeCollectionRuleSet"),
    );
    expect(() => computeCollectionRuleSet(unresolved, validDate)).toThrow(
      new UnresolvedZoneClassificationError("computeCollectionRuleSet"),
    );
    expect(() => computeCollectionRuleSet(unresolved, validDate)).toThrow(
      UnresolvedZoneClassificationError,
    );
  });

  test("a zone with isInnerCityNightCollection null throws with any recyclingCalendarGroup value", () => {
    const unresolvedWithGroup: ZoneClassification = {
      zone: "zone-unconfirmed",
      isInnerCityNightCollection: null,
      recyclingCalendarGroup: 1,
    };
    const validDate = new Date(Date.UTC(2026, 0, 12));

    expect(() => computeCollectionRuleSet(unresolvedWithGroup, validDate)).toThrow(
      UnresolvedZoneClassificationError,
    );
  });
});

describe("UnresolvedZoneClassificationError", () => {
  test("is also a RangeError", () => {
    const err = new UnresolvedZoneClassificationError("computeCollectionRuleSet");
    expect(err).toBeInstanceOf(RangeError);
    expect(err).toBeInstanceOf(UnresolvedZoneClassificationError);
  });
});
