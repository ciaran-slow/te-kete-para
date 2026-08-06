import { dictionaries, type Locale, type TranslationKey } from "@/lib/i18n/dictionaries";
import type { CollectionRuleSet, TimeWindow, WasteBinType } from "@/lib/schedule/rules";
import type { DispatchPayload } from "./dispatcher";

export interface LocalizedPushContent {
  title: string;
  body: string;
}

const BIN_TYPE_KEYS: Record<WasteBinType, TranslationKey> = {
  "glass-recycling": "schedule.binType.glassRecycling",
  "mixed-recycling": "schedule.binType.mixedRecycling",
  "yellow-bag-rubbish": "schedule.binType.yellowBagRubbish",
  cardboard: "schedule.binType.cardboard",
};

function t(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale][key];
}

function formatTimeWindow(locale: Locale, timeWindow: TimeWindow): string {
  if (timeWindow.end === null) {
    return `${t(locale, "schedule.putOutBy")} ${timeWindow.start}`;
  }
  return `${t(locale, "schedule.collectionWindow")}: ${timeWindow.start}–${timeWindow.end}`;
}

function formatBinList(locale: Locale, ruleSet: CollectionRuleSet): string {
  return ruleSet.binTypes.map((binType) => t(locale, BIN_TYPE_KEYS[binType])).join(", ");
}

export function buildLocalizedPushContent(payload: DispatchPayload): LocalizedPushContent {
  const { languagePreference: locale, ruleSet } = payload;
  const title = t(locale, "notification.collectionReminder.title");
  const body = `${t(locale, "notification.collectionReminder.binsPrefix")} ${formatBinList(locale, ruleSet)}. ${formatTimeWindow(locale, ruleSet.timeWindow)}`;
  return { title, body };
}
