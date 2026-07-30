export const LOCALES = ["en", "mi"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export const en = {
  "app.name": "Te Kete Para",
  "app.tagline": "Protect the environment, take care of your waste.",
  "app.description":
    "The bilingual rubbish and recycling companion for Wellington — Te Whanganui-a-Tara.",
  "language.toggle.label": "Choose language",
  "language.toggle.en": "English",
  "language.toggle.mi": "Te Reo Māori",
  "language.changed": "Language changed to English.",
} as const;

export type TranslationKey = keyof typeof en;

export const mi: Record<TranslationKey, string> = {
  "app.name": "Te Kete Para",
  "app.tagline": "Tiakina te taiao, kia mauria te para.",
  "app.description":
    "Te hoa reorua mō te para me te hangarua mō Te Whanganui-a-Tara.",
  "language.toggle.label": "Kōwhiria te reo",
  "language.toggle.en": "English",
  "language.toggle.mi": "Te Reo Māori",
  "language.changed": "Kua huri te reo ki te reo Māori.",
};

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  mi,
};
