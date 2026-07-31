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
  "address.search.label": "Search for your street address",
  "address.search.placeholder": "e.g. Cuba Street",
  "address.search.resultsLabel": "Matching addresses",
  "address.search.loading": "Searching…",
  "address.search.noResults": "No matching addresses. Check the spelling and try again.",
  "address.search.resultsAvailable":
    "Results are available below. Use the up and down arrow keys to choose one.",
  "address.search.error": "We couldn't search addresses right now. Please try again.",
  "schedule.heading": "Today's collection",
  "schedule.noAddressSelected":
    "Search for your address above to see today's collection.",
  "schedule.dateLabel": "Date",
  "schedule.binsHeading": "Bins to put out",
  "schedule.putOutBy": "Put out by",
  "schedule.collectionWindow": "Collection window",
  "schedule.binType.generalRubbish": "General rubbish",
  "schedule.binType.glassRecycling": "Glass recycling crate",
  "schedule.binType.mixedRecycling": "Mixed recycling (paper, plastic, metal)",
  "schedule.binType.yellowBagRubbish": "Yellow rubbish bag",
  "schedule.binType.cardboard": "Cardboard",
  "schedule.error":
    "We couldn't work out today's collection for this address. Please try again.",
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
  "address.search.label": "Rapua tō wāhitau tiriti",
  "address.search.placeholder": "Hei tauira, Cuba Street",
  "address.search.resultsLabel": "Ngā wāhitau e rite ana",
  "address.search.loading": "E rapu ana…",
  "address.search.noResults":
    "Kāore he wāhitau e rite ana. Tirohia te tuhi, ka whakamātau anō.",
  "address.search.resultsAvailable":
    "Kua rite ngā hua i raro nei. Whakamahia ngā pātuhi pere ki te kōwhiri.",
  "address.search.error":
    "Kāore i taea te rapu wāhitau i tēnei wā. Whakamātauria anō.",
  "schedule.heading": "Te kohinga o tēnei rā",
  "schedule.noAddressSelected":
    "Rapua tō wāhitau i runga ake nei kia kite i te kohinga o tēnei rā.",
  "schedule.dateLabel": "Rā",
  "schedule.binsHeading": "Ngā kete hei whakaputa",
  "schedule.putOutBy": "Whakaputahia i mua i te",
  "schedule.collectionWindow": "Wā kohinga",
  "schedule.binType.generalRubbish": "Para Whānui",
  "schedule.binType.glassRecycling": "Kete Karāhe",
  "schedule.binType.mixedRecycling": "Rauemi Hangarua (pepa, kirihou, konganuku)",
  "schedule.binType.yellowBagRubbish": "Pēke Kōwhai Para",
  "schedule.binType.cardboard": "Kāta",
  "schedule.error":
    "Kāore i taea te tātai i te kohinga mō tēnei wāhitau. Whakamātauria anō.",
};

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  mi,
};
