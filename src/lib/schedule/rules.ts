/**
 * Pure collection-rule computation for a Wellington zone (vision.md §4A):
 * suburban 7:00 AM kerbside + alternating glass/mixed recycling, vs.
 * inner-city/Te Aro 5:30–10:00 PM yellow-bag night collection with Tuesday
 * cardboard. No DB access — see ADR 0015 (why classification is an input,
 * not derived from the zone string) and ADR 0016/ADR 0042 (the alternating-
 * week epoch anchor is corrected to a sourced WCC calendar date, though the
 * per-zone Calendar 1 vs 2 assignment is still open — issue #102).
 *
 * Dates are read as their UTC calendar date only (`getUTCFullYear` /
 * `getUTCMonth` / `getUTCDate`) — wall-clock time and the caller's local
 * time zone are ignored. Always construct inputs with `Date.UTC(...)` or a
 * `Z`-suffixed ISO string; a local-time constructor (`new Date(2024, 0, 1)`)
 * can resolve to the *previous* UTC calendar day in NZDT and silently shift
 * every result by one day.
 */

export type WasteBinType =
  | "general-rubbish"
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

/**
 * The zone-level classification the rule engine needs, sourced from
 * `addresses` (`zone`, `is_inner_city_night_collection`) — never
 * re-derived from the zone string itself (ADR 0015).
 */
export interface ZoneClassification {
  zone: string;
  isInnerCityNightCollection: boolean;
}

export interface SuburbanRuleSet {
  collectionType: "suburban-kerbside";
  zone: string;
  binTypes: WasteBinType[];
  timeWindow: TimeWindow;
  isRecyclingWeek: boolean;
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
// Monday 2026-01-12 UTC = a confirmed "glass" week under WCC's published
// Calendar 1 (ADR 0042). Calendar 1 vs Calendar 2 per zone is still
// unconfirmed — issue #102.
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

  const dateUtcMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const daysSinceEpoch = Math.floor(
    (dateUtcMs - RECYCLING_EPOCH_UTC_MS) / MS_PER_DAY,
  );
  const weeksSinceEpoch = Math.floor(daysSinceEpoch / 7);
  const isGlassWeek = (((weeksSinceEpoch % 2) + 2) % 2) === 0;
  const recyclingType: "glass" | "mixed" = isGlassWeek ? "glass" : "mixed";
  const binTypes: WasteBinType[] = ["general-rubbish"];
  binTypes.push(isGlassWeek ? "glass-recycling" : "mixed-recycling");

  return {
    collectionType: "suburban-kerbside",
    zone: zone.zone,
    binTypes,
    timeWindow: { start: "07:00", end: null },
    isRecyclingWeek: true,
    recyclingType,
  };
}
