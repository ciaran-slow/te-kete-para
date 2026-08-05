import { getDb } from "@/lib/db";
import {
  computeCollectionRuleSet,
  UnresolvedRecyclingCalendarGroupError,
  type CollectionRuleSet,
  type ZoneClassification,
} from "@/lib/schedule/rules";
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
 * Decides whether `subscription` needs a payload built for tomorrow (NZ
 * local), and builds it if so. Returns null — a no-op — when the
 * subscription has no resolvable zone classification (no linked address, or
 * `computeCollectionRuleSet` rejects the zone/date pair). Given the current
 * schedule model (the `schedules` per-date/per-zone table exists but is not
 * yet populated or read by anything — `computeCollectionRuleSet` returns a
 * valid rule set for every date once a zone classification resolves), a
 * resolvable zone always means "tomorrow is a collection day": the only
 * no-op path reachable today is a missing/invalid address link. This is a
 * known simplification, not a hidden bug — a future per-street collection
 * calendar (schedules table) would gate here too, once it exists.
 */
export function planDispatchForSubscription(
  subscription: DispatchSubscription,
  now: Date,
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
 */
export async function collectNightlyDispatchCandidates(
  now: Date,
): Promise<DispatchPayload[]> {
  const db = getDb();
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
    };
    const candidate = planDispatchForSubscription(subscription, now);
    if (candidate !== null) candidates.push(candidate);
  }
  return candidates;
}
