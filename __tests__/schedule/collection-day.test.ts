import { describe, expect, test } from "vitest";
import {
  findNextCollectionDate,
  isCollectionDay,
  toCollectionDayClassification,
  type CollectionDayClassification,
  type Weekday,
} from "../../src/lib/schedule/collection-day";
import { UnresolvedZoneClassificationError } from "../../src/lib/schedule/rules";

const SUBURBAN_WEDNESDAY: CollectionDayClassification = {
  isInnerCityNightCollection: false,
  collectionWeekday: 3,
};

const INNER_CITY: CollectionDayClassification = {
  isInnerCityNightCollection: true,
  collectionWeekday: null,
};

describe("toCollectionDayClassification", () => {
  test("maps is_inner_city_night_collection 1/0 to a real boolean", () => {
    const truthy = toCollectionDayClassification({
      is_inner_city_night_collection: 1,
      collection_weekday: null,
    });
    expect(truthy.isInnerCityNightCollection).toBe(true);
    expect(typeof truthy.isInnerCityNightCollection).toBe("boolean");

    const falsy = toCollectionDayClassification({
      is_inner_city_night_collection: 0,
      collection_weekday: 3,
    });
    expect(falsy.isInnerCityNightCollection).toBe(false);
    expect(typeof falsy.isInnerCityNightCollection).toBe("boolean");
  });

  test("passes through boundary weekday values 0 and 6 unchanged", () => {
    expect(
      toCollectionDayClassification({
        is_inner_city_night_collection: 0,
        collection_weekday: 0,
      }).collectionWeekday,
    ).toBe(0);
    expect(
      toCollectionDayClassification({
        is_inner_city_night_collection: 0,
        collection_weekday: 6,
      }).collectionWeekday,
    ).toBe(6);
  });

  test("maps is_inner_city_night_collection null to null, not false (issue #178, ADR 0075)", () => {
    const unresolved = toCollectionDayClassification({
      is_inner_city_night_collection: null,
      collection_weekday: null,
    });
    expect(unresolved.isInnerCityNightCollection).toBeNull();
  });

  test("maps collection_weekday null to null", () => {
    expect(
      toCollectionDayClassification({
        is_inner_city_night_collection: 1,
        collection_weekday: null,
      }).collectionWeekday,
    ).toBeNull();
  });

  test("maps an out-of-range raw value to null defensively", () => {
    expect(
      toCollectionDayClassification({
        is_inner_city_night_collection: 0,
        collection_weekday: 7,
      }).collectionWeekday,
    ).toBeNull();
    expect(
      toCollectionDayClassification({
        is_inner_city_night_collection: 0,
        collection_weekday: -1,
      }).collectionWeekday,
    ).toBeNull();
  });
});

describe("isCollectionDay", () => {
  test("suburban address: true when the date's weekday matches collectionWeekday", () => {
    // 2026-08-05 is a Wednesday.
    expect(
      isCollectionDay(SUBURBAN_WEDNESDAY, new Date(Date.UTC(2026, 7, 5))),
    ).toBe(true);
  });

  test("suburban address: false when the date's weekday does not match", () => {
    // 2026-08-06 is a Thursday.
    expect(
      isCollectionDay(SUBURBAN_WEDNESDAY, new Date(Date.UTC(2026, 7, 6))),
    ).toBe(false);
  });

  test("inner-city address is always a collection day, regardless of collectionWeekday", () => {
    // 2026-08-06 is a Thursday, which would be false for a suburban
    // collectionWeekday: 3 (Wednesday) classification — proves the
    // inner-city branch never consults collectionWeekday at all.
    expect(
      isCollectionDay(INNER_CITY, new Date(Date.UTC(2026, 7, 6))),
    ).toBe(true);
  });

  test("reads only the UTC calendar date, not the local (Pacific/Auckland) one", () => {
    // 2026-08-05T23:00:00Z is Wednesday in UTC, but already Thursday in
    // Pacific/Auckland (NZST, UTC+12, no DST in August — pinned suite-wide,
    // ADR 0017). A getUTCDay() -> local getDay() regression would flip
    // both assertions below.
    const lateInUtcWednesday = new Date("2026-08-05T23:00:00Z");

    expect(isCollectionDay(SUBURBAN_WEDNESDAY, lateInUtcWednesday)).toBe(
      true,
    );
    expect(
      isCollectionDay(
        { isInnerCityNightCollection: false, collectionWeekday: 4 },
        lateInUtcWednesday,
      ),
    ).toBe(false);
  });

  test("an invalid date throws a RangeError, identically on repeat calls", () => {
    const invalidDate = new Date("not-a-date");

    expect(() => isCollectionDay(SUBURBAN_WEDNESDAY, invalidDate)).toThrow(
      new RangeError("isCollectionDay: date is invalid."),
    );
    expect(() => isCollectionDay(SUBURBAN_WEDNESDAY, invalidDate)).toThrow(
      new RangeError("isCollectionDay: date is invalid."),
    );
  });

  test("a suburban address with collectionWeekday null throws a RangeError, identically on repeat calls", () => {
    const noWeekday: CollectionDayClassification = {
      isInnerCityNightCollection: false,
      collectionWeekday: null,
    };
    const validDate = new Date(Date.UTC(2026, 7, 5));

    expect(() => isCollectionDay(noWeekday, validDate)).toThrow(
      new RangeError(
        "isCollectionDay: collectionWeekday must be 0-6 for a suburban address.",
      ),
    );
    expect(() => isCollectionDay(noWeekday, validDate)).toThrow(
      new RangeError(
        "isCollectionDay: collectionWeekday must be 0-6 for a suburban address.",
      ),
    );
  });

  test("a suburban address with an out-of-range collectionWeekday throws a RangeError, identically on repeat calls", () => {
    const badWeekday: CollectionDayClassification = {
      isInnerCityNightCollection: false,
      collectionWeekday: 7 as unknown as Weekday,
    };
    const validDate = new Date(Date.UTC(2026, 7, 5));

    expect(() => isCollectionDay(badWeekday, validDate)).toThrow(
      new RangeError(
        "isCollectionDay: collectionWeekday must be 0-6 for a suburban address.",
      ),
    );
    expect(() => isCollectionDay(badWeekday, validDate)).toThrow(
      new RangeError(
        "isCollectionDay: collectionWeekday must be 0-6 for a suburban address.",
      ),
    );
  });

  test("isInnerCityNightCollection null throws UnresolvedZoneClassificationError, identically on repeat calls", () => {
    const unresolved: CollectionDayClassification = {
      isInnerCityNightCollection: null,
      collectionWeekday: null,
    };
    const validDate = new Date(Date.UTC(2026, 7, 5));

    expect(() => isCollectionDay(unresolved, validDate)).toThrow(
      new UnresolvedZoneClassificationError("isCollectionDay"),
    );
    expect(() => isCollectionDay(unresolved, validDate)).toThrow(
      new UnresolvedZoneClassificationError("isCollectionDay"),
    );
  });
});

describe("findNextCollectionDate", () => {
  test("inner-city: returns fromDate's own UTC calendar date unchanged, even with a non-midnight time", () => {
    const midDay = new Date("2026-08-05T14:30:00Z");

    const result = findNextCollectionDate(INNER_CITY, midDay);

    expect(result.getTime()).toBe(Date.UTC(2026, 7, 5));
  });

  test("suburban: fromDate's weekday IS collectionWeekday — inclusive boundary", () => {
    // Wed 5 Aug 2026, collectionWeekday: 3 (Wednesday).
    const result = findNextCollectionDate(
      SUBURBAN_WEDNESDAY,
      new Date(Date.UTC(2026, 7, 5)),
    );

    expect(result.getTime()).toBe(Date.UTC(2026, 7, 5));
  });

  test("suburban: fromDate is exactly one day before collectionWeekday", () => {
    // Tue 4 Aug 2026, collectionWeekday: 3 (Wednesday) -> Wed 5 Aug.
    const result = findNextCollectionDate(
      SUBURBAN_WEDNESDAY,
      new Date(Date.UTC(2026, 7, 4)),
    );

    expect(result.getTime()).toBe(Date.UTC(2026, 7, 5));
  });

  test("suburban: wraps around a full week when the weekday has just passed", () => {
    // Tue 4 Aug 2026, collectionWeekday: 1 (Monday) -> next Monday is 6
    // days later (10 Aug), not a same-week/negative-offset result. This
    // is what a naive same-week-only scan, or a modulo missing "+ 7"
    // before "% 7", would get wrong.
    const mondayClassification: CollectionDayClassification = {
      isInnerCityNightCollection: false,
      collectionWeekday: 1,
    };

    const result = findNextCollectionDate(
      mondayClassification,
      new Date(Date.UTC(2026, 7, 4)),
    );

    expect(result.getTime()).toBe(Date.UTC(2026, 7, 10));
  });

  test("reads only the UTC calendar date, not the local (Pacific/Auckland) one", () => {
    // 2026-08-05T23:00:00Z is Wednesday in UTC but already Thursday in
    // Pacific/Auckland. Under the correct UTC reading, a
    // collectionWeekday: 3 (Wednesday) classification is "0 days away"
    // (today), and collectionWeekday: 4 (Thursday) is "1 day away" — a
    // local-getter regression that thought "today" was already Thursday
    // would instead compute 0 days for the Thursday case.
    const lateInUtcWednesday = new Date("2026-08-05T23:00:00Z");

    expect(
      findNextCollectionDate(SUBURBAN_WEDNESDAY, lateInUtcWednesday).getTime(),
    ).toBe(Date.UTC(2026, 7, 5));
    expect(
      findNextCollectionDate(
        { isInnerCityNightCollection: false, collectionWeekday: 4 },
        lateInUtcWednesday,
      ).getTime(),
    ).toBe(Date.UTC(2026, 7, 6));
  });

  test("repeat calls return an equal date each time, as distinct Date objects", () => {
    const fromDate = new Date(Date.UTC(2026, 7, 4));

    const resultA = findNextCollectionDate(SUBURBAN_WEDNESDAY, fromDate);
    const resultB = findNextCollectionDate(SUBURBAN_WEDNESDAY, fromDate);
    const resultC = findNextCollectionDate(SUBURBAN_WEDNESDAY, fromDate);

    expect(resultA.getTime()).toBe(resultB.getTime());
    expect(resultB.getTime()).toBe(resultC.getTime());
    expect(resultA).not.toBe(resultB);
    expect(resultB).not.toBe(resultC);
  });

  test("an invalid fromDate throws a RangeError, identically on repeat calls", () => {
    const invalidDate = new Date("not-a-date");

    expect(() =>
      findNextCollectionDate(SUBURBAN_WEDNESDAY, invalidDate),
    ).toThrow(new RangeError("findNextCollectionDate: fromDate is invalid."));
    expect(() =>
      findNextCollectionDate(SUBURBAN_WEDNESDAY, invalidDate),
    ).toThrow(new RangeError("findNextCollectionDate: fromDate is invalid."));
  });

  test("a suburban address with an invalid collectionWeekday throws a RangeError, identically on repeat calls", () => {
    const noWeekday: CollectionDayClassification = {
      isInnerCityNightCollection: false,
      collectionWeekday: null,
    };
    const validDate = new Date(Date.UTC(2026, 7, 5));

    expect(() => findNextCollectionDate(noWeekday, validDate)).toThrow(
      new RangeError(
        "findNextCollectionDate: collectionWeekday must be 0-6 for a suburban address.",
      ),
    );
    expect(() => findNextCollectionDate(noWeekday, validDate)).toThrow(
      new RangeError(
        "findNextCollectionDate: collectionWeekday must be 0-6 for a suburban address.",
      ),
    );
  });

  test("isInnerCityNightCollection null throws UnresolvedZoneClassificationError, identically on repeat calls", () => {
    const unresolved: CollectionDayClassification = {
      isInnerCityNightCollection: null,
      collectionWeekday: null,
    };
    const validDate = new Date(Date.UTC(2026, 7, 5));

    expect(() => findNextCollectionDate(unresolved, validDate)).toThrow(
      new UnresolvedZoneClassificationError("findNextCollectionDate"),
    );
    expect(() => findNextCollectionDate(unresolved, validDate)).toThrow(
      new UnresolvedZoneClassificationError("findNextCollectionDate"),
    );
  });
});
