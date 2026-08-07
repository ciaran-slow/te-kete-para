import { getDb } from "@/lib/db";
import {
  computeCollectionRuleSet,
  UnresolvedRecyclingCalendarGroupError,
  type CollectionRuleSet,
  type ZoneClassification,
} from "@/lib/schedule/rules";
import {
  isCollectionDay,
  toCollectionDayClassification,
  type CollectionDayClassification,
  type Weekday,
} from "@/lib/schedule/collection-day";
import {
  computeHolidayShift,
  formatUtcDateString,
  type HolidayRecord,
} from "@/lib/schedule/holiday-shift";
import { isLocale, type Locale } from "@/lib/i18n/dictionaries";

/** A push_subscriptions row joined with its address's zone classification, if any. */
export interface DispatchSubscription {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  languagePreference: Locale;
  /** null when address_id is null, or the addresses row is unresolvable. */
  zone: ZoneClassification | null;
  /**
   * Which real WCC weekday this address's weekly kerbside collection falls
   * on (ADR 0063), already narrowed to 0-6 or null. Null for an inner-city
   * night-collection address (collects every night, not one weekday) or a
   * suburban address not yet confirmed. Meaningless when `zone` is null.
   */
  collectionWeekday: Weekday | null;
}

/**
 * The pre-localization dispatch payload for one subscription: WHO to notify
 * and WHAT collection rule set applies tomorrow. This is deliberately not
 * the final Web Push payload — #28 takes this, renders a localized title/body
 * via the translation dictionary keyed on `languagePreference`, and sends it.
 * #28 should import this shape and `collectNightlyDispatchCandidates` rather
 * than re-deriving the join/decision logic.
 */
export interface DispatchPayload {
  subscriptionId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  languagePreference: Locale;
  /** NZ-local "tomorrow", as an ISO YYYY-MM-DD (the date collection.ruleSet applies to). */
  collectionDate: string;
  ruleSet: CollectionRuleSet;
}

/**
 * Converts a UTC instant into Pacific/Auckland's *wall-clock* calendar date
 * via Intl's explicit `timeZone` option, then advances it one day — "tomorrow"
 * as NZ residents experience it, re-expressed as the UTC-midnight `Date`
 * `computeCollectionRuleSet` requires (rules.ts's UTC-calendar-date contract).
 *
 * Deliberately NOT local Date getters (`now.getDate()` etc., the pattern
 * `todayAsUtcCalendarDate` in schedule-display.tsx uses for the client,
 * ADR 0018) and NOT a fixed UTC+13/+12 offset. This module runs server-side,
 * where the host process's timezone is not guaranteed to be Pacific/Auckland
 * — Vitest pins TZ=Pacific/Auckland suite-wide (ADR 0017), but that pin
 * covers only the test process, not production. An implementation using
 * local getters here would pass this issue's entire test suite (since tests
 * run under the pinned TZ, local getters already equal NZ wall-clock time)
 * while being silently wrong on a UTC-default production server — see
 * ADR 0045, and the dedicated test below (spying on `Intl.DateTimeFormat`
 * to assert it is called with an explicit `Pacific/Auckland` timeZone) that
 * exists specifically to close that blind spot.
 */
export function tomorrowInNzAsUtcDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day") + 1));
}

function formatUtcIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Whether `date` is a genuine collection day for `classification`, correcting
 * `isCollectionDay`'s plain nominal-weekday match for a WCC holiday shift
 * (ADR 0038, `computeHolidayShift`) in both directions issue #185 identified:
 *
 * - `date` is itself a listed holiday: nothing is actually collected that
 *   day even though its own weekday may nominally match `collectionWeekday`
 *   — the collection is delayed, not skipped, so this must be a `false`
 *   even when the plain nominal check would say `true`.
 * - `date` is the fully chain-resolved (ADR 0030) shifted date of some
 *   *other* listed holiday whose own weekday matches `collectionWeekday` —
 *   the real, delayed collection day for this address that week, even
 *   though `date`'s own weekday doesn't nominally match.
 *
 * Scoped to suburban (weekday-gated) addresses: an inner-city-night
 * subscriber is always eligible regardless of `date`, unchanged from ADR
 * 0073 — see ADR 0077 for why holiday-awareness is not extended to
 * inner-city dispatch here.
 *
 * Checks `date` against every row in `holidays` rather than a fixed number
 * of days ahead/behind it: unlike `<ShiftAlertBanner>`'s `LOOKAHEAD_DAYS`
 * (ADR 0032), which bounds an arbitrary UX "how far ahead to warn" choice,
 * there is no calendar distance beyond which a holiday shift stops being
 * relevant to `date` — only a data-size one, and `holidays` is already
 * established to be small and fetched in full, unfiltered, for the same
 * reason (ADR 0032's Decision for `/api/holidays`). See ADR 0077.
 */
export function isRealCollectionDay(
  classification: CollectionDayClassification,
  date: Date,
  holidays: HolidayRecord[],
): boolean {
  if (classification.isInnerCityNightCollection) return true;

  if (computeHolidayShift(date, holidays).isShifted) return false;

  if (isCollectionDay(classification, date)) return true;

  const dateStr = formatUtcDateString(date.getTime());
  return holidays.some((holiday) => {
    const holidayDate = new Date(`${holiday.date}T00:00:00Z`);
    return (
      isCollectionDay(classification, holidayDate) &&
      computeHolidayShift(holidayDate, holidays).shiftedDate === dateStr
    );
  });
}

/**
 * Decides whether `subscription` needs a payload built for tomorrow (NZ
 * local), and builds it if so. Returns null — a no-op — in three cases: no
 * resolvable zone classification (no linked address, or
 * `computeCollectionRuleSet` rejects the zone/date pair — logging when the
 * specific reason is an unresolved `recyclingCalendarGroup`, ADR 0068); an
 * inner-city-night-collection address is always eligible past that point
 * (collects every night); a suburban address additionally needs its
 * confirmed `collectionWeekday` (ADR 0063) to resolve to tomorrow's *real*,
 * holiday-shift-aware collection day (`isRealCollectionDay`, ADR 0077,
 * superseding ADR 0073's plain `isCollectionDay` nominal-weekday check) — a
 * confirmed non-matching day is a silent no-op (tomorrow just isn't this
 * address's real collection day), but an unconfirmed (`null`)
 * `collectionWeekday` logs a `console.error` exactly like the
 * `recyclingCalendarGroup` case, because it is the same class of bug: a
 * permanent per-address data gap that would otherwise silently exclude a
 * subscriber from every future nightly run. `holidays` defaults to `[]` so
 * a caller with no holiday data (e.g. this file's pre-#185 tests) gets
 * exactly the old plain-nominal-match behaviour unchanged.
 */
export function planDispatchForSubscription(
  subscription: DispatchSubscription,
  now: Date,
  holidays: HolidayRecord[] = [],
): DispatchPayload | null {
  if (subscription.zone === null) return null;

  const tomorrow = tomorrowInNzAsUtcDate(now);
  let ruleSet: CollectionRuleSet;
  try {
    ruleSet = computeCollectionRuleSet(subscription.zone, tomorrow);
  } catch (err) {
    if (err instanceof UnresolvedRecyclingCalendarGroupError) {
      console.error(
        `[dispatcher] Dropping subscription ${subscription.id} (zone "${subscription.zone.zone}"): recyclingCalendarGroup is unresolved.`,
      );
    }
    return null;
  }

  const dayClassification: CollectionDayClassification = {
    isInnerCityNightCollection: subscription.zone.isInnerCityNightCollection,
    collectionWeekday: subscription.collectionWeekday,
  };

  if (!dayClassification.isInnerCityNightCollection && dayClassification.collectionWeekday === null) {
    console.error(
      `[dispatcher] Dropping subscription ${subscription.id} (zone "${subscription.zone.zone}"): collectionWeekday is unconfirmed.`,
    );
    return null;
  }

  if (!isRealCollectionDay(dayClassification, tomorrow, holidays)) {
    return null;
  }

  return {
    subscriptionId: subscription.id,
    endpoint: subscription.endpoint,
    p256dh: subscription.p256dh,
    auth: subscription.auth,
    languagePreference: subscription.languagePreference,
    collectionDate: formatUtcIsoDate(tomorrow),
    ruleSet,
  };
}

interface DispatchRow {
  id: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  language_preference: string;
  zone: string | null;
  is_inner_city_night_collection: number | null;
  recycling_calendar_group: number | null;
  collection_weekday: number | null;
}

interface HolidayDispatchRow {
  holiday_date: string;
  shift_days: number;
}

/**
 * DB-aware entry point: joins every push_subscriptions row against its
 * address (left join — a subscription with no address_id, or whose
 * addresses row no longer exists, still comes back with zone: null rather
 * than being silently dropped from the query), then runs each through
 * `planDispatchForSubscription`, discarding no-ops. No DB access happens
 * inside `planDispatchForSubscription` itself (mirrors ADR 0015's DB-free
 * core / DB-aware caller split already used by rules.ts and
 * holiday-shift.ts). Rejects on a query failure rather than swallowing it
 * into an empty array — a silent empty result here means nobody gets
 * notified tonight with no error anywhere; #110's trigger route decides how
 * a rejection here surfaces (alerting, retry, etc.).
 *
 * Also reads the entire `holidays` table once per run (mirroring
 * `src/app/api/holidays/route.ts`'s own query shape, ADR 0077, issue #185)
 * and passes it to every `planDispatchForSubscription` call below, so a
 * suburban subscriber's gate is holiday-shift-aware
 * (`isRealCollectionDay`). Reading it once per run rather than once per
 * subscription means a malformed `holidays` row rejects this entire call,
 * not just one subscription — an accepted trade-off, see ADR 0077's
 * Trade-offs.
 */
export async function collectNightlyDispatchCandidates(
  now: Date,
): Promise<DispatchPayload[]> {
  const db = getDb();

  const holidayRows: HolidayDispatchRow[] = await db("holidays")
    .orderBy("holiday_date", "asc")
    .select("holiday_date", "shift_days");
  const holidays: HolidayRecord[] = holidayRows.map((row) => ({
    date: row.holiday_date,
    shiftDays: row.shift_days,
  }));

  const rows: DispatchRow[] = await db("push_subscriptions as ps")
    .leftJoin("addresses as a", "ps.address_id", "a.id")
    .select(
      "ps.id as id",
      "ps.endpoint as endpoint",
      "ps.p256dh as p256dh",
      "ps.auth as auth",
      "ps.language_preference as language_preference",
      "a.zone as zone",
      "a.is_inner_city_night_collection as is_inner_city_night_collection",
      "a.recycling_calendar_group as recycling_calendar_group",
      "a.collection_weekday as collection_weekday",
    );

  const candidates: DispatchPayload[] = [];
  for (const row of rows) {
    const subscription: DispatchSubscription = {
      id: row.id,
      endpoint: row.endpoint,
      p256dh: row.p256dh,
      auth: row.auth,
      languagePreference: isLocale(row.language_preference) ? row.language_preference : "en",
      zone:
        row.zone === null
          ? null
          : {
              zone: row.zone,
              isInnerCityNightCollection: Boolean(row.is_inner_city_night_collection),
              recyclingCalendarGroup:
                row.recycling_calendar_group === 1 || row.recycling_calendar_group === 2
                  ? row.recycling_calendar_group
                  : null,
            },
      collectionWeekday:
        row.zone === null
          ? null
          : toCollectionDayClassification({
              is_inner_city_night_collection: row.is_inner_city_night_collection ?? false,
              collection_weekday: row.collection_weekday,
            }).collectionWeekday,
    };
    const candidate = planDispatchForSubscription(subscription, now, holidays);
    if (candidate !== null) candidates.push(candidate);
  }
  return candidates;
}
