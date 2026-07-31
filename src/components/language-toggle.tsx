"use client";

import { RadioGroup } from "radix-ui";
import { isLocale } from "@/lib/i18n/dictionaries";
import { useTranslation } from "@/lib/i18n/language-provider";

const ITEM_CLASS =
  "flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-papa-ink touch-target focus-ring data-[state=checked]:bg-moana data-[state=checked]:text-papa";

export function LanguageToggle() {
  const { locale, setLocale, t } = useTranslation();

  return (
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
  );
}
