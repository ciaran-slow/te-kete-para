"use client";

import { ToggleGroup } from "radix-ui";
import { isLocale } from "@/lib/i18n/dictionaries";
import { useTranslation } from "@/lib/i18n/language-provider";

const ITEM_CLASS =
  "flex min-h-12 min-w-12 items-center justify-center rounded-full px-4 py-2 text-sm font-medium text-papa-ink outline-none data-[state=on]:bg-moana data-[state=on]:text-papa focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-moana";

export function LanguageToggle() {
  const { locale, setLocale, t } = useTranslation();

  return (
    <ToggleGroup.Root
      type="single"
      value={locale}
      onValueChange={(value) => {
        /* Radix fires onValueChange("") when the pressed item is clicked
           again; without this guard that empty string would be written over
           the stored locale. tsc will NOT catch the unguarded version —
           onValueChange's method-shorthand signature is checked bivariantly. */
        if (isLocale(value)) {
          setLocale(value);
        }
      }}
      aria-label={t("language.toggle.label")}
      className="inline-flex gap-1 rounded-full bg-papa p-1"
    >
      <ToggleGroup.Item value="en" className={ITEM_CLASS}>
        {t("language.toggle.en")}
      </ToggleGroup.Item>
      <ToggleGroup.Item value="mi" className={ITEM_CLASS}>
        {t("language.toggle.mi")}
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  );
}
