/**
 * Renders today's computed collection rules for a selected address
 * (FR-02, vision.md §4A/B). Shows *today's* rule set, not a scanned
 * "next collection date" — see ADR 0019 for why. "Today" is always the
 * viewer's local calendar date, computed only on a render path that is
 * reachable exclusively client-side, after a user selection — see ADR 0018
 * for why that is safe and why it must stay that way.
 */
"use client";

import { useId } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { SuburbSearchResult } from "./address-search";
import { StatusRegion } from "./status-region";
import {
  computeCollectionRuleSet,
  type CollectionRuleSet,
  type TimeWindow,
  type WasteBinType,
} from "@/lib/schedule/rules";

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
  todayUtc: Date;
}

function computeSchedule(
  address: SuburbSearchResult,
  now: Date | undefined,
): ComputedSchedule {
  const todayUtc = todayAsUtcCalendarDate(now ?? new Date());
  try {
    const ruleSet = computeCollectionRuleSet(
      {
        zone: address.zone,
        isInnerCityNightCollection: address.isInnerCityNightCollection,
      },
      todayUtc,
    );
    return { ruleSet, todayUtc };
  } catch {
    return { ruleSet: null, todayUtc };
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
      {schedule === null && <p>{t("schedule.noAddressSelected")}</p>}
      {schedule !== null && ruleSet === null && <p>{t("schedule.error")}</p>}
      {schedule !== null && ruleSet !== null && (
        <>
          <h2
            id={headingId}
            className="font-heading text-lg font-semibold text-moana"
          >
            {t("schedule.heading")}
          </h2>
          <p>
            <span className="font-medium">{t("schedule.dateLabel")}: </span>
            {formatUtcCalendarDate(schedule.todayUtc)}
          </p>
          <div>
            <p className="font-medium">{t("schedule.binsHeading")}</p>
            <ul>
              {ruleSet.binTypes.map((binType) => (
                <li key={binType}>{t(BIN_TYPE_KEYS[binType])}</li>
              ))}
            </ul>
          </div>
          <p>{formatTimeWindowLabel(t, ruleSet.timeWindow)}</p>
        </>
      )}
    </StatusRegion>
  );
}
