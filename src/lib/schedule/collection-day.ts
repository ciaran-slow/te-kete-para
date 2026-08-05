/**
 * Real per-address collection-day-of-week data (ADR 0063, issue #117),
 * closing the gap ADR 0019 and ADR 0053 both named: nothing in `addresses`
 * previously marked which weekday a given street is actually collected on,
 * so every suburban calendar date looked equally plausible as "your
 * collection day." Sourced from WCC's live per-street lookup tool — the
 * same two endpoints ADR 0059/issue #102 already documented and used — not
 * derived from `zone`: WCC's per-street collection weekday does not follow
 * this repo's zone taxonomy any more reliably than its recycling-calendar
 * boundary does (zone-west and zone-north each mix weekdays across their
 * seeded streets).
 *
 * No DB access here — classification is passed in explicitly, mirroring
 * the `computeCollectionRuleSet`/`computeHolidayShift` pattern (ADR 0015).
 * Dates are read as their UTC calendar date only, exactly like rules.ts
 * (ADR 0017): always construct inputs via `Date.UTC(...)` or a
 * `Z`-suffixed ISO string.
 *
 * Consuming these functions inside `<ScheduleDisplay>`/`<ShiftAlertBanner>`
 * to restore a genuine per-address claim (superseding ADR 0019/ADR 0053) is
 * issue #134's scope, not this one's — this module deliberately stops at
 * the data + pure-function layer.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** `Date#getUTCDay()` convention: 0 = Sunday ... 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The per-address fields these functions need, sourced from
 * `addresses.is_inner_city_night_collection` / `addresses.collection_weekday`
 * — never re-derived from `zone` (ADR 0063, mirroring ADR 0015).
 */
export interface CollectionDayClassification {
  isInnerCityNightCollection: boolean;
  /**
   * Which real WCC weekday this address's weekly kerbside collection falls
   * on, confirmed via WCC's live per-street lookup tool (ADR 0063). `null`
   * for inner-city night-collection addresses, which collect every night
   * rather than one weekday, and for any suburban address not yet
   * confirmed.
   */
  collectionWeekday: Weekday | null;
}

interface AddressCollectionDayRow {
  is_inner_city_night_collection: number | boolean;
  collection_weekday: number | null;
}

/** Maps a raw `addresses` row to the classification these functions need. */
export function toCollectionDayClassification(
  row: AddressCollectionDayRow,
): CollectionDayClassification {
  const raw = row.collection_weekday;
  const collectionWeekday =
    raw !== null && Number.isInteger(raw) && raw >= 0 && raw <= 6
      ? (raw as Weekday)
      : null;
  return {
    isInnerCityNightCollection: Boolean(row.is_inner_city_night_collection),
    collectionWeekday,
  };
}

function assertValidDate(date: Date, fnName: string, paramName: string): void {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`${fnName}: ${paramName} is invalid.`);
  }
}

function utcCalendarDate(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function requireSuburbanWeekday(
  classification: CollectionDayClassification,
  fnName: string,
): Weekday {
  const { collectionWeekday } = classification;
  if (
    collectionWeekday === null ||
    collectionWeekday < 0 ||
    collectionWeekday > 6
  ) {
    throw new RangeError(
      `${fnName}: collectionWeekday must be 0-6 for a suburban address.`,
    );
  }
  return collectionWeekday;
}

/**
 * Whether `date` is a genuine collection day for this address: every night
 * for inner-city night collection, or the one confirmed weekday for a
 * suburban address. Reads only `date`'s UTC calendar date (ADR 0017).
 */
export function isCollectionDay(
  classification: CollectionDayClassification,
  date: Date,
): boolean {
  assertValidDate(date, "isCollectionDay", "date");

  if (classification.isInnerCityNightCollection) {
    return true;
  }

  const collectionWeekday = requireSuburbanWeekday(
    classification,
    "isCollectionDay",
  );
  return date.getUTCDay() === collectionWeekday;
}

/**
 * The next real collection date on or after `fromDate` (inclusive), as a
 * UTC-midnight `Date`. Returns `fromDate`'s own UTC calendar date unchanged
 * for inner-city night collection, which collects every night. For a
 * suburban address, computes the day offset to the next occurrence of
 * `collectionWeekday` directly (0-6 days ahead, wrapping past the end of
 * the week) rather than scanning.
 */
export function findNextCollectionDate(
  classification: CollectionDayClassification,
  fromDate: Date,
): Date {
  assertValidDate(fromDate, "findNextCollectionDate", "fromDate");
  const startUtc = utcCalendarDate(fromDate);

  if (classification.isInnerCityNightCollection) {
    return startUtc;
  }

  const collectionWeekday = requireSuburbanWeekday(
    classification,
    "findNextCollectionDate",
  );
  const daysUntilCollection =
    (collectionWeekday - startUtc.getUTCDay() + 7) % 7;
  return new Date(startUtc.getTime() + daysUntilCollection * MS_PER_DAY);
}
