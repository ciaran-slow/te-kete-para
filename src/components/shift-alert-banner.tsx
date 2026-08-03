/**
 * Proactive shift-alert banner (vision.md §4B, issue #24): announces an
 * upcoming holiday-shifted collection through the shared aria-live
 * `<StatusRegion>` (ADR 0021), bilingual per `LanguageContext`. Fully built
 * and tested but deliberately not composed into any route yet — the seeded
 * holiday calendar is unverified pending issue #78 (ADR 0031).
 *
 * `address` is a prop for exactly one reason: to gate when the banner is
 * allowed to show or fetch anything — the same address-selection gate
 * `<ScheduleDisplay>` uses (ADR 0018): never during a render reachable by
 * SSR, only after a real `AddressSearch.onSelect` event. `address`'s
 * `zone`/`isInnerCityNightCollection` fields are read by nothing in this
 * component — a public holiday is council-wide, not per-zone (ADR 0029), so
 * there is no zone-specific holiday logic to go looking for.
 */
"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Locale, TranslationKey } from "@/lib/i18n/dictionaries";
import type { SuburbSearchResult } from "./address-search";
import { StatusRegion } from "./status-region";
import {
  todayAsUtcCalendarDate,
  formatUtcCalendarDate,
} from "./schedule-display";
import {
  computeHolidayShift,
  formatUtcDateString,
} from "@/lib/schedule/holiday-shift";

/**
 * Mirrors the JSON contract of GET /api/holidays
 * (src/app/api/holidays/route.ts, ADR 0013). Duplicated here rather than
 * imported so this client bundle never depends on a route module's file
 * (ADR 0014's rationale, reused).
 */
export interface HolidayApiRecord {
  date: string;
  nameEn: string;
  nameMi: string;
  shiftDays: number;
}

/** How many calendar days ahead (inclusive of today) to check for an
 * upcoming holiday shift. See ADR 0032 for why 7, not 1 or 14. */
export const LOOKAHEAD_DAYS = 6; // today + 6 more days = 7 calendar days
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface UpcomingShift {
  holiday: HolidayApiRecord;
  /** "YYYY-MM-DD" — the original collection date the holiday falls on. */
  originalDate: string;
  /** "YYYY-MM-DD" — the fully chain-resolved (ADR 0030) shifted date. */
  shiftedDate: string;
}

/**
 * Scans `todayUtc` through `todayUtc + LOOKAHEAD_DAYS` days (inclusive) and
 * returns the earliest date in that window that is itself a listed holiday,
 * together with the fully-resolved shifted date. Returns `null` when no
 * date in the window is a holiday. Pure — never mutates `holidays`.
 *
 * `computeHolidayShift(candidateDate, holidays).isShifted` is true if and
 * only if the candidate's own UTC calendar date is itself a key in
 * `holidays` (its loop only enters the `while` when the *starting* date
 * matches), so scanning day by day and checking `isShifted` on each
 * candidate correctly answers "is this specific day a listed holiday" —
 * never a false positive carried over from an earlier day in the loop.
 */
export function findUpcomingShift(
  todayUtc: Date,
  holidays: HolidayApiRecord[],
): UpcomingShift | null {
  for (let offset = 0; offset <= LOOKAHEAD_DAYS; offset += 1) {
    const candidateMs = todayUtc.getTime() + offset * MS_PER_DAY;
    const candidateDateStr = formatUtcDateString(candidateMs);
    const result = computeHolidayShift(new Date(candidateMs), holidays);
    if (result.isShifted) {
      const holiday = holidays.find((h) => h.date === candidateDateStr);
      // Defensive only: unreachable from any caller passing a `holidays`
      // array unchanged between the computeHolidayShift call above and this
      // .find — isShifted === true means candidateDateStr is in the list.
      if (holiday === undefined) continue;
      return {
        holiday,
        originalDate: candidateDateStr,
        shiftedDate: result.shiftedDate,
      };
    }
  }
  return null;
}

export interface ShiftAlertBannerProps {
  address: SuburbSearchResult | null;
  /** Test-only "today" override, same convention as ScheduleDisplay (ADR 0018). */
  now?: Date;
  /**
   * Test-only holidays override. Production callers omit this — the
   * component fetches GET /api/holidays itself once `address` is non-null.
   */
  holidays?: HolidayApiRecord[];
}

type FetchState =
  | { status: "idle" }
  | { status: "loaded"; holidays: HolidayApiRecord[] }
  | { status: "error" };

export function ShiftAlertBanner({
  address,
  now,
  holidays: holidaysOverride,
}: ShiftAlertBannerProps) {
  const { t, locale } = useTranslation();
  const [fetchState, setFetchState] = useState<FetchState>({ status: "idle" });
  const addressKey = address === null ? null : address.id;

  useEffect(() => {
    if (addressKey === null || holidaysOverride !== undefined) return;
    const controller = new AbortController();
    // No synchronous "loading" reset here: react-hooks/set-state-in-effect
    // (error-level in this repo, ADR 0009) forbids a setState reachable
    // synchronously in the effect body, and nothing renders differently
    // while a request is in flight — the banner stays empty until holidays
    // arrive. All setState calls live in the promise callbacks (ADR 0032).
    fetch("/api/holidays", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as
          | { results: HolidayApiRecord[] }
          | { error: string };
        if (!response.ok) throw new Error("holidays-fetch-failed");
        return body as { results: HolidayApiRecord[] };
      })
      .then((body) =>
        setFetchState({ status: "loaded", holidays: body.results }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFetchState({ status: "error" });
      });
    return () => controller.abort();
  }, [addressKey, holidaysOverride]);

  const holidays =
    holidaysOverride ??
    (fetchState.status === "loaded" ? fetchState.holidays : null);
  const fetchFailed =
    holidaysOverride === undefined && fetchState.status === "error";

  const message = computeBannerMessage({
    address,
    holidays,
    fetchFailed,
    now,
    t,
    locale,
  });

  return (
    <StatusRegion
      as="div"
      atomic
      className={
        message
          ? "w-full max-w-md rounded-md border-2 border-kowhai px-4 py-3 text-left text-sm font-medium text-papa-ink"
          : "sr-only"
      }
    >
      {message ?? ""}
    </StatusRegion>
  );
}

function computeBannerMessage(args: {
  address: SuburbSearchResult | null;
  holidays: HolidayApiRecord[] | null;
  fetchFailed: boolean;
  now: Date | undefined;
  t: (key: TranslationKey) => string;
  locale: Locale;
}): string | null {
  const { address, holidays, fetchFailed, now, t, locale } = args;
  if (address === null) return null;
  if (fetchFailed) return t("shiftAlert.error");
  if (holidays === null) return null; // still loading / idle

  try {
    const todayUtc = todayAsUtcCalendarDate(now ?? new Date());
    const shift = findUpcomingShift(todayUtc, holidays);
    if (shift === null) return null;
    const holidayName =
      locale === "mi" ? shift.holiday.nameMi : shift.holiday.nameEn;
    return `${t("shiftAlert.prefix")} ${formatUtcCalendarDate(parseIsoDateUtc(shift.originalDate))} (${holidayName}) ${t("shiftAlert.shiftsTo")} ${formatUtcCalendarDate(parseIsoDateUtc(shift.shiftedDate))}.`;
  } catch {
    // Malformed holidays data (defensive — real /api/holidays rows always
    // pass computeHolidayShift's validation): same fallback as a fetch error.
    return t("shiftAlert.error");
  }
}

function parseIsoDateUtc(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}
