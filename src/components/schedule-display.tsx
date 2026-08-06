/**
 * Renders the genuine next collection for a selected address (FR-02,
 * vision.md §4A/B): the next real calendar date this address is actually
 * collected on, and the bin types/time window that apply on that date —
 * not "today's rules regardless of whether today is a real collection day"
 * (ADR 0019's compromise, superseded by ADR 0066 now that per-address
 * `collectionWeekday` data exists, ADR 0063/issue #117). "Today" (the scan's
 * starting point) is still always the viewer's local calendar date, computed
 * only on a render path that is reachable exclusively client-side, after a
 * user selection — see ADR 0018 for why that is safe and why it must stay
 * that way; that constraint is unchanged by ADR 0066.
 */
"use client";

import { useId } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { SuburbSearchResult } from "./address-search";
import { StatusRegion } from "./status-region";
import {
  computeCollectionRuleSet,
  UnresolvedRecyclingCalendarGroupError,
  type CollectionRuleSet,
  type TimeWindow,
  type WasteBinType,
} from "@/lib/schedule/rules";
import {
  findNextCollectionDate,
  type CollectionDayClassification,
} from "@/lib/schedule/collection-day";

export interface ScheduleDisplayProps {
  address: SuburbSearchResult | null;
  /**
   * Test-only override for "today". Production callers must omit this —
   * see ADR 0018. Never compute a default for this outside the
   * `address !== null` branch below.
   */
  now?: Date;
}

const BIN_TYPE_KEYS: Record<WasteBinType, TranslationKey> = {
  "general-rubbish": "schedule.binType.generalRubbish",
  "glass-recycling": "schedule.binType.glassRecycling",
  "mixed-recycling": "schedule.binType.mixedRecycling",
  "yellow-bag-rubbish": "schedule.binType.yellowBagRubbish",
  cardboard: "schedule.binType.cardboard",
};

/**
 * "yellow-bag-rubbish" is the one bin type that's a literal yellow bag
 * (inner-city night collection, rules.ts); every other type — including
 * "general-rubbish", a suburban wheelie bin — isn't, so only this one gets
 * kōwhai theming (vision.md's amber accent is scoped to "yellow bag
 * alerts" specifically, not routine rubbish of any kind).
 */
const BIN_TYPE_PILL_CLASS: Record<WasteBinType, string> = {
  "general-rubbish": "bg-moana/10 text-moana",
  "glass-recycling": "bg-moana/10 text-moana",
  "mixed-recycling": "bg-moana/10 text-moana",
  "yellow-bag-rubbish": "bg-kowhai/15 text-kowhai",
  cardboard: "bg-moana/10 text-moana",
};

/**
 * Converts `reference`'s *local* calendar date — the viewer's device time
 * zone, assumed Wellington — into the UTC-midnight `Date` that
 * `computeCollectionRuleSet` expects (rules.ts, ADR 0017). Deliberately
 * uses local getters (`getFullYear`/`getMonth`/`getDate`), the opposite of
 * rules.ts's own contract: this is the one place that translates "the
 * viewer's wall-clock calendar day" into the UTC-normalised value the rule
 * engine consumes. See ADR 0018.
 */
export function todayAsUtcCalendarDate(reference: Date): Date {
  return new Date(
    Date.UTC(
      reference.getFullYear(),
      reference.getMonth(),
      reference.getDate(),
    ),
  );
}

/** Locale-neutral `DD/MM/YYYY` — no Intl/ICU dependency. See ADR 0018. */
export function formatUtcCalendarDate(date: Date): string {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function formatTimeWindowLabel(
  t: (key: TranslationKey) => string,
  timeWindow: TimeWindow,
): string {
  if (timeWindow.end === null) {
    return `${t("schedule.putOutBy")} ${timeWindow.start}`;
  }
  return `${t("schedule.collectionWindow")}: ${timeWindow.start}–${timeWindow.end}`;
}

interface ComputedSchedule {
  ruleSet: CollectionRuleSet | null;
  collectionDateUtc: Date;
  /** Only meaningful when ruleSet is null. */
  unresolvedCalendarGroup: boolean;
}

function computeSchedule(
  address: SuburbSearchResult,
  now: Date | undefined,
): ComputedSchedule {
  const todayUtc = todayAsUtcCalendarDate(now ?? new Date());
  try {
    const classification: CollectionDayClassification = {
      isInnerCityNightCollection: address.isInnerCityNightCollection,
      collectionWeekday: address.collectionWeekday,
    };
    const collectionDateUtc = findNextCollectionDate(classification, todayUtc);
    const ruleSet = computeCollectionRuleSet(
      {
        zone: address.zone,
        isInnerCityNightCollection: address.isInnerCityNightCollection,
        recyclingCalendarGroup: address.recyclingCalendarGroup,
      },
      collectionDateUtc,
    );
    return { ruleSet, collectionDateUtc, unresolvedCalendarGroup: false };
  } catch (err) {
    return {
      ruleSet: null,
      collectionDateUtc: todayUtc,
      unresolvedCalendarGroup: err instanceof UnresolvedRecyclingCalendarGroupError,
    };
  }
}

export function ScheduleDisplay({ address, now }: ScheduleDisplayProps) {
  const { t } = useTranslation();
  const headingId = useId();
  const schedule = address === null ? null : computeSchedule(address, now);
  const ruleSet = schedule?.ruleSet ?? null;

  return (
    <StatusRegion
      as="section"
      atomic
      headingId={ruleSet ? headingId : undefined}
      className="w-full max-w-md text-left text-papa-ink"
    >
      {schedule === null && (
        <p className="text-papa-ink/70">{t("schedule.noAddressSelected")}</p>
      )}
      {schedule !== null && ruleSet === null && schedule.unresolvedCalendarGroup && (
        <p className="text-papa-ink/70">
          {t("schedule.calendarGroupUnconfirmed")}
        </p>
      )}
      {schedule !== null && ruleSet === null && !schedule.unresolvedCalendarGroup && (
        <p className="text-papa-ink/70">{t("schedule.error")}</p>
      )}
      {schedule !== null && ruleSet !== null && (
        <div className="flex flex-col gap-4">
          <h2
            id={headingId}
            className="font-heading text-lg font-semibold text-moana"
          >
            {t("schedule.heading")}
          </h2>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-papa-ink/70">
              {t("schedule.dateLabel")}
            </p>
            <p className="text-2xl font-bold">
              {formatUtcCalendarDate(schedule.collectionDateUtc)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-papa-ink/70">
              {t("schedule.binsHeading")}
            </p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {ruleSet.binTypes.map((binType) => (
                <li
                  key={binType}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${BIN_TYPE_PILL_CLASS[binType]}`}
                >
                  {t(BIN_TYPE_KEYS[binType])}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-papa-ink/70">
            {formatTimeWindowLabel(t, ruleSet.timeWindow)}
          </p>
        </div>
      )}
    </StatusRegion>
  );
}
