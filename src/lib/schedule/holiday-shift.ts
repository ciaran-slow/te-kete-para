/**
 * Pure holiday-shift resolution for a candidate Wellington collection date
 * (vision.md §4B): WCC delays a collection that would otherwise fall on a
 * public holiday. No DB access — `holidays` is supplied by the caller,
 * sourced from the `holidays` table (architecture.md §2C, ADR 0029), the
 * same explicit-input shape `computeCollectionRuleSet` uses for zone
 * classification (ADR 0015).
 *
 * A shift is resolved by re-checking the new date against the same
 * `holidays` list and shifting again if it, too, is a listed holiday (ADR
 * 0030) — e.g. a collection due on New Year's Day (2026-01-01) shifts to
 * 2026-01-02, which is itself "Day after New Year's Day," so it shifts
 * again to 2026-01-03. Termination is guaranteed by validating every
 * `holidays[].shiftDays` as a positive integer: each shift strictly
 * advances the calendar date, and a calendar date can match at most one
 * entry in `holidays`, so the chain visits a strictly increasing, finite
 * sequence of dates and must exit once it reaches one absent from the
 * list — no iteration cap is needed or added.
 *
 * Dates are read as their UTC calendar date only (`getUTCFullYear` /
 * `getUTCMonth` / `getUTCDate`), matching `src/lib/schedule/rules.ts`'s
 * contract. Always construct `date` with `Date.UTC(...)` or a `Z`-suffixed
 * ISO string; a local-time constructor can resolve to the *previous* UTC
 * calendar day in NZDT and silently shift every result by one day.
 *
 * `formatUtcDateString` is exported for `src/components/shift-alert-banner.tsx`
 * (issue #24), which reuses it instead of reimplementing UTC "YYYY-MM-DD"
 * formatting a second time.
 */

/**
 * One row of the `holidays` table's data the caller passes in — never
 * looked up by this module itself.
 */
export interface HolidayRecord {
  /** Calendar date the holiday falls on, "YYYY-MM-DD" (matches `holidays.holiday_date`). */
  date: string;
  /** Days collection is delayed when it falls on this holiday (matches `holidays.shift_days`). Must be a positive integer. */
  shiftDays: number;
}

export interface HolidayShiftResult {
  /** True if `date`, or any date it was shifted to while resolving the chain, matched an entry in `holidays`. */
  isShifted: boolean;
  /**
   * The effective collection date after applying every applicable shift,
   * "YYYY-MM-DD". Equals `date`'s own UTC calendar date, formatted the same
   * way, when `isShifted` is `false`.
   */
  shiftedDate: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const HOLIDAY_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatUtcDateString(utcMs: number): string {
  const d = new Date(utcMs);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function computeHolidayShift(
  date: Date,
  holidays: HolidayRecord[],
): HolidayShiftResult {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("computeHolidayShift: date is invalid.");
  }

  // Validate in array order, failing on the first bad entry, and build the
  // lookup in the same pass. If two entries share the same `date`, the later
  // one in the array silently wins — the real `holidays` table has a unique
  // constraint on `holiday_date`, so this path is unreachable from any
  // caller sourcing real data.
  const shiftDaysByDate = new Map<string, number>();
  for (const holiday of holidays) {
    if (!HOLIDAY_DATE_PATTERN.test(holiday.date)) {
      throw new RangeError(
        'computeHolidayShift: holiday.date must be a valid "YYYY-MM-DD" date string.',
      );
    }
    const parsedMs = Date.parse(`${holiday.date}T00:00:00Z`);
    if (
      Number.isNaN(parsedMs) ||
      formatUtcDateString(parsedMs) !== holiday.date
    ) {
      throw new RangeError(
        'computeHolidayShift: holiday.date must be a valid "YYYY-MM-DD" date string.',
      );
    }
    if (!Number.isInteger(holiday.shiftDays) || holiday.shiftDays < 1) {
      throw new RangeError(
        "computeHolidayShift: holiday.shiftDays must be a positive integer.",
      );
    }
    shiftDaysByDate.set(holiday.date, holiday.shiftDays);
  }

  let currentUtcMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  let isShifted = false;
  let currentDateStr = formatUtcDateString(currentUtcMs);
  while (shiftDaysByDate.has(currentDateStr)) {
    isShifted = true;
    currentUtcMs += shiftDaysByDate.get(currentDateStr)! * MS_PER_DAY;
    currentDateStr = formatUtcDateString(currentUtcMs);
  }

  return { isShifted, shiftedDate: currentDateStr };
}
