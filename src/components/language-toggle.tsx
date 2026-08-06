"use client";

import { useState } from "react";
import { RadioGroup } from "radix-ui";
import { dictionaries, isLocale } from "@/lib/i18n/dictionaries";
import { useTranslation } from "@/lib/i18n/language-provider";
import { StatusRegion } from "./status-region";

const ITEM_CLASS =
  "flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-papa-ink touch-target focus-ring data-[state=checked]:bg-moana data-[state=checked]:text-papa";

export function LanguageToggle() {
  const { locale, setLocale, t } = useTranslation();
  const [announcement, setAnnouncement] = useState("");

  return (
    <>
      <RadioGroup.Root
        value={locale}
        onValueChange={(value) => {
          /* onValueChange's signature is (value: string) => void; isLocale
             narrows it to Locale for setLocale without an `as` cast. Unlike
             ToggleGroup, RadioGroup has no deselect concept — clicking the
             checked item is a no-op and onValueChange never fires "" — and
             arrow keys move focus AND select, matching the native radio
             keyboard contract for the role="radiogroup"/"radio" this renders. */
          if (isLocale(value)) {
            setLocale(value);
            /* dictionaries[value], not t(...): t closes over the current
               (pre-switch) locale, which would announce the string for the
               language being left, not the one being switched to (ADR 0021,
               issue #152). onValueChange only fires on a real value change,
               so this can only run on an actual switch. */
            setAnnouncement(dictionaries[value]["language.changed"]);
          }
        }}
        aria-label={t("language.toggle.label")}
        className="inline-flex gap-1 rounded-full bg-papa p-1"
      >
        <RadioGroup.Item value="en" lang="en" className={ITEM_CLASS}>
          {t("language.toggle.en")}
        </RadioGroup.Item>
        <RadioGroup.Item value="mi" lang="mi" className={ITEM_CLASS}>
          {t("language.toggle.mi")}
        </RadioGroup.Item>
      </RadioGroup.Root>
      {/* Permanently mounted — StatusRegion's aria-live contract only fires
          for text changes inside an already-mounted region (sorting-search.tsx's
          voice-status regions follow the same shape). */}
      <StatusRegion as="p" className="sr-only">
        {announcement}
      </StatusRegion>
    </>
  );
}
