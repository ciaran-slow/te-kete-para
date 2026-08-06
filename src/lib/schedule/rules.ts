/**
 * Pure collection-rule computation for a Wellington zone (vision.md §4A):
 * suburban 7:00 AM kerbside yellow-bag rubbish + alternating glass/mixed
 * recycling, vs. inner-city/Te Aro 5:30–10:00 PM yellow-bag night collection
 * with Tuesday cardboard. WCC's official rubbish bag is yellow city-wide
 * (vision.md §1: "suburban yellow bags... inner-city night collections
 * [also] yellow bags") — there is no separate wheelie-bin general-rubbish
 * container in either zone; only the collection time and the accompanying
 * recycling/cardboard items differ (ADR 0069). No DB access — classification
 * is passed in explicitly rather
 * than re-derived from the zone string (ADR 0015), and the alternating
 * recycling cadence is anchored to a sourced WCC calendar date (ADR
 * 0042). Which of WCC's two independently-phased calendars a given
 * address follows is confirmed per-address and passed in as
 * `recyclingCalendarGroup` (ADR 0059, issue #102) — not derived from the
 * zone string, since WCC's calendar boundary does not align with this
 * repo's zone taxonomy.
 *
 * Dates are read as their UTC calendar date only (`getUTCFullYear` /
 * `getUTCMonth` / `getUTCDate`) — wall-clock time and the caller's local
 * time zone are ignored. Always construct inputs with `Date.UTC(...)` or a
 * `Z`-suffixed ISO string; a local-time constructor (`new Date(2024, 0, 1)`)
 * can resolve to the *previous* UTC calendar day in NZDT and silently shift
 * every result by one day.
 */

export type WasteBinType =
  | "glass-recycling"
  | "mixed-recycling"
  | "yellow-bag-rubbish"
  | "cardboard";

export interface TimeWindow {
  /** 24-hour "HH:MM" time bins must be out by / collection may start. */
  start: string;
  /**
   * 24-hour "HH:MM" end of the collection window, or `null` when WCC
   * publishes a single put-out time rather than a range (suburban
   * kerbside).
   */
  end: string | null;
}

export type RecyclingCalendarGroup = 1 | 2;

/**
 * The zone-level classification the rule engine needs, sourced from
 * `addresses` (`zone`, `is_inner_city_night_collection`) — never
 * re-derived from the zone string itself (ADR 0015).
 */
export interface ZoneClassification {
  zone: string;
  isInnerCityNightCollection: boolean;
  /**
   * Which of WCC's two independently-phased alternating recycling
   * calendars (ADR 0042) this address actually follows — confirmed
   * per-address via WCC's live per-street lookup tool, not derived from
   * `zone` (ADR 0059, issue #102). `null` for inner-city night-collection
   * addresses, which do not alternate glass/mixed.
   */
  recyclingCalendarGroup: RecyclingCalendarGroup | null;
}

export interface SuburbanRuleSet {
  collectionType: "suburban-kerbside";
  zone: string;
  binTypes: WasteBinType[];
  timeWindow: TimeWindow;
  recyclingType: "glass" | "mixed";
}

export interface InnerCityRuleSet {
  collectionType: "inner-city-night";
  zone: string;
  binTypes: WasteBinType[];
  timeWindow: TimeWindow;
  isCardboardNight: boolean;
}

export type CollectionRuleSet = SuburbanRuleSet | InnerCityRuleSet;

/**
 * Thrown by computeCollectionRuleSet when a suburban zone has no resolvable
 * recyclingCalendarGroup (ADR 0059) — a distinct subclass (still a
 * RangeError, so any existing broad `catch` or `instanceof RangeError` check
 * keeps working unchanged) so callers can distinguish "this address
 * genuinely hasn't been confirmed yet" from every other rejected-unknown
 * case (invalid date, blank zone string) without re-deriving the
 * classification-validity condition themselves (ADR 0068).
 */
export class UnresolvedRecyclingCalendarGroupError extends RangeError {
  constructor() {
    super(
      "computeCollectionRuleSet: recyclingCalendarGroup must be 1 or 2 for a suburban zone.",
    );
    this.name = "UnresolvedRecyclingCalendarGroupError";
  }
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Monday 2026-01-12 UTC = a confirmed "glass" week under WCC's published
// Calendar 1 (ADR 0042). Calendar 2 is Calendar 1's exact photographic
// inverse (ADR 0042) — a zone.recyclingCalendarGroup of 2 flips this
// epoch's parity rather than anchoring to a second, independently-sourced
// date. Which calendar each address actually follows is confirmed
// per-address, not per-zone (ADR 0059, issue #102).
const RECYCLING_EPOCH_UTC_MS = Date.UTC(2026, 0, 12);

export function computeCollectionRuleSet(
  zone: ZoneClassification,
  date: Date,
): CollectionRuleSet {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("computeCollectionRuleSet: date is invalid.");
  }
  if (zone.zone.trim().length === 0) {
    throw new RangeError(
      "computeCollectionRuleSet: zone must be a non-empty string.",
    );
  }

  if (zone.isInnerCityNightCollection) {
    const isCardboardNight = date.getUTCDay() === 2;
    const binTypes: WasteBinType[] = ["yellow-bag-rubbish"];
    if (isCardboardNight) {
      binTypes.push("cardboard");
    }
    return {
      collectionType: "inner-city-night",
      zone: zone.zone,
      binTypes,
      timeWindow: { start: "17:30", end: "22:00" },
      isCardboardNight,
    };
  }

  if (zone.recyclingCalendarGroup !== 1 && zone.recyclingCalendarGroup !== 2) {
    throw new UnresolvedRecyclingCalendarGroupError();
  }

  const dateUtcMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const daysSinceEpoch = Math.floor(
    (dateUtcMs - RECYCLING_EPOCH_UTC_MS) / MS_PER_DAY,
  );
  const weeksSinceEpoch = Math.floor(daysSinceEpoch / 7);
  const isGlassWeekCalendar1 = (((weeksSinceEpoch % 2) + 2) % 2) === 0;
  const isGlassWeek =
    zone.recyclingCalendarGroup === 1 ? isGlassWeekCalendar1 : !isGlassWeekCalendar1;
  const recyclingType: "glass" | "mixed" = isGlassWeek ? "glass" : "mixed";
  const binTypes: WasteBinType[] = ["yellow-bag-rubbish"];
  binTypes.push(isGlassWeek ? "glass-recycling" : "mixed-recycling");

  return {
    collectionType: "suburban-kerbside",
    zone: zone.zone,
    binTypes,
    timeWindow: { start: "07:00", end: null },
    recyclingType,
  };
}
