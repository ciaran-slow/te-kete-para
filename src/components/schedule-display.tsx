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
import { BottleWine, Package, Recycle, Trash, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { SuburbSearchResult } from "./address-search";
import { StatusRegion } from "./status-region";
import {
  computeCollectionRuleSet,
  UnresolvedRecyclingCalendarGroupError,
  UnresolvedZoneClassificationError,
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
  "glass-recycling": "schedule.binType.glassRecycling",
  "mixed-recycling": "schedule.binType.mixedRecycling",
  "yellow-bag-rubbish": "schedule.binType.yellowBagRubbish",
  cardboard: "schedule.binType.cardboard",
};

/**
 * "yellow-bag-rubbish" is WCC's official rubbish bag — the same container
 * city-wide, suburban and inner-city alike (ADR 0069) — so it's the only
 * bin type that gets kōwhai theming (vision.md's amber accent is scoped to
 * "yellow bag alerts"); the recycling/cardboard types stay neutral. Dark
 * text on a tinted fill, not kōwhai-coloured text — same pairing
 * shift-alert-banner.tsx already uses, since kōwhai itself doesn't clear
 * body-text contrast at this size against a light fill.
 */
const BIN_TYPE_PILL_CLASS: Record<WasteBinType, string> = {
  "glass-recycling": "bg-moana/10 text-moana",
  "mixed-recycling": "bg-moana/10 text-moana",
  "yellow-bag-rubbish": "bg-kowhai/20 text-papa-ink",
  cardboard: "bg-moana/10 text-moana",
};

/**
 * The icon's own colour is independent of BIN_TYPE_PILL_CLASS's text
 * colour above — the pill deliberately keeps yellow-bag-rubbish's *text*
 * dark for contrast (kōwhai fails body-text contrast at this size), but a
 * decorative, aria-hidden icon isn't body text, so it can carry the actual
 * kōwhai theming a resident expects for "the yellow bag" at a glance.
 */
const BIN_TYPE_ICON_COLOR_CLASS: Record<WasteBinType, string> = {
  "glass-recycling": "text-moana",
  "mixed-recycling": "text-moana",
  "yellow-bag-rubbish": "text-kowhai",
  cardboard: "text-moana",
};

/**
 * One lucide-react icon per bin type (ADR 0070) — a maintained icon set
 * instead of hand-drawn shapes; each is a real component already, so this
 * is a lookup, not a switch. Rendered with aria-hidden at the call site,
 * since the text label beside it already names the bin.
 */
const BIN_TYPE_ICON: Record<WasteBinType, LucideIcon> = {
  "yellow-bag-rubbish": Trash,
  "glass-recycling": BottleWine,
  "mixed-recycling": Recycle,
  cardboard: Package,
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

export interface ComputedSchedule {
  ruleSet: CollectionRuleSet | null;
  collectionDateUtc: Date;
  /** Only meaningful when ruleSet is null. */
  unresolvedCalendarGroup: boolean;
  /** Only meaningful when ruleSet is null. */
  unresolvedClassification: boolean;
}

export function computeSchedule(
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
    return {
      ruleSet,
      collectionDateUtc,
      unresolvedCalendarGroup: false,
      unresolvedClassification: false,
    };
  } catch (err) {
    return {
      ruleSet: null,
      collectionDateUtc: todayUtc,
      unresolvedCalendarGroup: err instanceof UnresolvedRecyclingCalendarGroupError,
      unresolvedClassification: err instanceof UnresolvedZoneClassificationError,
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
      {schedule !== null && ruleSet === null && schedule.unresolvedClassification && (
        <p className="text-papa-ink/70">{t("schedule.classificationUnconfirmed")}</p>
      )}
      {schedule !== null &&
        ruleSet === null &&
        !schedule.unresolvedCalendarGroup &&
        !schedule.unresolvedClassification && (
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
              {ruleSet.binTypes.map((binType) => {
                const Icon = BIN_TYPE_ICON[binType];
                return (
                  <li
                    key={binType}
                    className={`flex w-32 flex-col items-center gap-1 rounded-lg px-2 py-2 text-center text-sm font-medium ${BIN_TYPE_PILL_CLASS[binType]}`}
                  >
                    <Icon
                      aria-hidden="true"
                      focusable="false"
                      className={`h-16 w-16 ${BIN_TYPE_ICON_COLOR_CLASS[binType]}`}
                    />
                    {t(BIN_TYPE_KEYS[binType])}
                  </li>
                );
              })}
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
