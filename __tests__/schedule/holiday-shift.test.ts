import { describe, expect, test } from "vitest";
import {
  computeHolidayShift,
  type HolidayRecord,
} from "../../src/lib/schedule/holiday-shift";

// A synthetic holiday list — deliberately not sourced from
// db/seeds/03_holidays.js — used to exercise computeHolidayShift's general
// contract: independent per-row shifts, chaining through calendar-adjacent
// holidays (ADR 0030), and UTC-only date reading. The confirmed 2026 seed
// (issue #78, ADR 0033) has no adjacent rows, so this fixture keeps that
// path covered without requiring it of real data.
const SYNTHETIC_HOLIDAYS: HolidayRecord[] = [
  { date: "2026-01-01", shiftDays: 1 }, // New Year's Day
  { date: "2026-01-02", shiftDays: 1 }, // Day after New Year's Day
  { date: "2026-04-03", shiftDays: 1 }, // Good Friday
  { date: "2026-12-25", shiftDays: 1 }, // Christmas Day
  { date: "2026-12-28", shiftDays: 1 }, // Boxing Day (observed)
];

describe("computeHolidayShift", () => {
  test("a normal week nowhere near a holiday is not shifted", () => {
    const result = computeHolidayShift(
      new Date(Date.UTC(2026, 5, 15)),
      SYNTHETIC_HOLIDAYS,
    );

    expect(result).toEqual({ isShifted: false, shiftedDate: "2026-06-15" });
  });

  test("Christmas Day shifts to Saturday (vision.md §4B example)", () => {
    const result = computeHolidayShift(
      new Date(Date.UTC(2026, 11, 25)),
      SYNTHETIC_HOLIDAYS,
    );

    expect(result).toEqual({ isShifted: true, shiftedDate: "2026-12-26" });
  });

  test("Good Friday shifts to Saturday (vision.md §4B example)", () => {
    const result = computeHolidayShift(
      new Date(Date.UTC(2026, 3, 3)),
      SYNTHETIC_HOLIDAYS,
    );

    expect(result).toEqual({ isShifted: true, shiftedDate: "2026-04-04" });
  });

  test("Boxing Day (observed) shifts independently of the other rows", () => {
    const result = computeHolidayShift(
      new Date(Date.UTC(2026, 11, 28)),
      SYNTHETIC_HOLIDAYS,
    );

    expect(result).toEqual({ isShifted: true, shiftedDate: "2026-12-29" });
  });

  test("adjacent holidays chain into a single resolved date (ADR 0030)", () => {
    const result = computeHolidayShift(
      new Date(Date.UTC(2026, 0, 1)),
      SYNTHETIC_HOLIDAYS,
    );

    // Does not stop at 2026-01-02 (itself a listed holiday) — keeps
    // shifting until it reaches 2026-01-03, which isn't in the list.
    expect(result).toEqual({ isShifted: true, shiftedDate: "2026-01-03" });
  });

  test("only the UTC calendar date is read, never wall-clock time", () => {
    const lateInUtcDay = computeHolidayShift(
      new Date("2026-12-25T23:00:00Z"),
      SYNTHETIC_HOLIDAYS,
    );
    const utcMidnight = computeHolidayShift(
      new Date(Date.UTC(2026, 11, 25)),
      SYNTHETIC_HOLIDAYS,
    );

    expect(lateInUtcDay).toEqual(utcMidnight);
  });

  test("an invalid date throws a RangeError, identically on repeat calls", () => {
    const invalidDate = new Date("not-a-date");

    expect(() =>
      computeHolidayShift(invalidDate, SYNTHETIC_HOLIDAYS),
    ).toThrow(new RangeError("computeHolidayShift: date is invalid."));
    expect(() =>
      computeHolidayShift(invalidDate, SYNTHETIC_HOLIDAYS),
    ).toThrow(new RangeError("computeHolidayShift: date is invalid."));
  });

  test("a malformed holiday date that parses to NaN throws a RangeError, identically on repeat calls", () => {
    const badHolidays: HolidayRecord[] = [{ date: "2026-13-01", shiftDays: 1 }];
    const validDate = new Date(Date.UTC(2026, 0, 1));

    expect(() => computeHolidayShift(validDate, badHolidays)).toThrow(
      new RangeError(
        'computeHolidayShift: holiday.date must be a valid "YYYY-MM-DD" date string.',
      ),
    );
    expect(() => computeHolidayShift(validDate, badHolidays)).toThrow(
      new RangeError(
        'computeHolidayShift: holiday.date must be a valid "YYYY-MM-DD" date string.',
      ),
    );
  });

  test("a holiday date not shaped YYYY-MM-DD throws the same RangeError", () => {
    // "2026-1-1" fails the /^\d{4}-\d{2}-\d{2}$/ shape check before
    // Date.parse is ever consulted — a distinct branch from the NaN and
    // round-trip checks below.
    const badHolidays: HolidayRecord[] = [{ date: "2026-1-1", shiftDays: 1 }];
    const validDate = new Date(Date.UTC(2026, 0, 1));

    expect(() => computeHolidayShift(validDate, badHolidays)).toThrow(
      new RangeError(
        'computeHolidayShift: holiday.date must be a valid "YYYY-MM-DD" date string.',
      ),
    );
  });

  test("a calendar-invalid holiday date that silently rolls over throws the same RangeError", () => {
    // Feb 30 normalizes to March 2 under Date.parse, so Date.parse itself
    // doesn't return NaN — the round-trip check catches it instead. This is
    // a distinct code path from the NaN branch above.
    const badHolidays: HolidayRecord[] = [{ date: "2026-02-30", shiftDays: 1 }];
    const validDate = new Date(Date.UTC(2026, 0, 1));

    expect(() => computeHolidayShift(validDate, badHolidays)).toThrow(
      new RangeError(
        'computeHolidayShift: holiday.date must be a valid "YYYY-MM-DD" date string.',
      ),
    );
  });

  test("a non-positive or non-integer shiftDays throws a RangeError", () => {
    const validDate = new Date(Date.UTC(2026, 0, 1));
    const zeroShift: HolidayRecord[] = [{ date: "2026-01-01", shiftDays: 0 }];
    const fractionalShift: HolidayRecord[] = [
      { date: "2026-01-01", shiftDays: 1.5 },
    ];

    expect(() => computeHolidayShift(validDate, zeroShift)).toThrow(
      new RangeError(
        "computeHolidayShift: holiday.shiftDays must be a positive integer.",
      ),
    );
    expect(() => computeHolidayShift(validDate, zeroShift)).toThrow(
      new RangeError(
        "computeHolidayShift: holiday.shiftDays must be a positive integer.",
      ),
    );
    expect(() => computeHolidayShift(validDate, fractionalShift)).toThrow(
      new RangeError(
        "computeHolidayShift: holiday.shiftDays must be a positive integer.",
      ),
    );
  });

  test("repeat calls are deterministic and never mutate the caller's holidays", () => {
    const resultA = computeHolidayShift(
      new Date(Date.UTC(2026, 0, 1)),
      SYNTHETIC_HOLIDAYS,
    );
    const resultB = computeHolidayShift(
      new Date(Date.UTC(2026, 0, 1)),
      SYNTHETIC_HOLIDAYS,
    );
    const resultC = computeHolidayShift(
      new Date(Date.UTC(2026, 0, 1)),
      SYNTHETIC_HOLIDAYS,
    );

    expect(resultA).toEqual({ isShifted: true, shiftedDate: "2026-01-03" });
    expect(resultB).toEqual({ isShifted: true, shiftedDate: "2026-01-03" });
    expect(resultC).toEqual({ isShifted: true, shiftedDate: "2026-01-03" });

    expect(SYNTHETIC_HOLIDAYS).toEqual([
      { date: "2026-01-01", shiftDays: 1 },
      { date: "2026-01-02", shiftDays: 1 },
      { date: "2026-04-03", shiftDays: 1 },
      { date: "2026-12-25", shiftDays: 1 },
      { date: "2026-12-28", shiftDays: 1 },
    ]);
  });
});
