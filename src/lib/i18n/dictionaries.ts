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
  "sortingSearch.heading": "What is this?",
  "sortingSearch.label": "Search for a household item",
  "sortingSearch.placeholder": "e.g. pizza box",
  "sortingSearch.resultsLabel": "Matching items",
  "sortingSearch.loading": "Searching…",
  "sortingSearch.noResults": "No matching items. Check the spelling and try again.",
  "sortingSearch.resultsAvailable": "Results are available below.",
  "sortingSearch.error":
    "We couldn't search household items right now. Please try again.",
  "sortingSearch.disposalHeading": "How to dispose of this",
  "sortingSearch.voice.button": "Search by voice",
  "sortingSearch.voice.stop": "Stop voice search",
  "sortingSearch.voice.listening": "Listening…",
  "sortingSearch.voice.error":
    "We couldn't hear you clearly. Please try again or type your search.",
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
  "shiftAlert.prefix": "Your collection due",
  "shiftAlert.shiftsTo": "shifts to",
  "shiftAlert.error":
    "We couldn't check for upcoming collection changes right now. Please try again.",
  "pushOptIn.label": "Night-before collection reminders",
  "pushOptIn.status.checking": "Checking your notification settings…",
  "pushOptIn.status.unsupported": "Push notifications aren't supported in this browser.",
  "pushOptIn.status.misconfigured": "Push notifications aren't available yet.",
  "pushOptIn.status.unsubscribed": "You're not receiving night-before reminders.",
  "pushOptIn.status.subscribing": "Turning on night-before reminders…",
  "pushOptIn.status.subscribed": "You're receiving night-before reminders.",
  "pushOptIn.status.unsubscribing": "Turning off night-before reminders…",
  "pushOptIn.status.denied": "Notifications are blocked for this site. Allow notifications in your browser settings to receive reminders.",
  "pushOptIn.status.subscribeError": "We couldn't turn on reminders. Please try again.",
  "pushOptIn.status.unsubscribeError": "We couldn't turn off reminders. Please try again.",
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
  "sortingSearch.heading": "He Aha Tēnei?",
  "sortingSearch.label": "Rapua tētahi mea kāinga",
  "sortingSearch.placeholder": "Hei tauira, pouaka pizza",
  "sortingSearch.resultsLabel": "Ngā mea e rite ana",
  "sortingSearch.loading": "E rapu ana…",
  "sortingSearch.noResults":
    "Kāore he mea e rite ana. Tirohia te tuhi, ka whakamātau anō.",
  "sortingSearch.resultsAvailable": "Kua rite ngā hua i raro nei.",
  "sortingSearch.error":
    "Kāore i taea te rapu mea kāinga i tēnei wā. Whakamātauria anō.",
  "sortingSearch.disposalHeading": "Me pēhea te whakapau i tēnei",
  "sortingSearch.voice.button": "Rapua mā te reo",
  "sortingSearch.voice.stop": "Whakamutua te rapu reo",
  "sortingSearch.voice.listening": "E whakarongo ana…",
  "sortingSearch.voice.error":
    "Kāore i mārama te rongo i a koe. Whakamātauria anō, tuhia rānei tō rapunga.",
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
  "shiftAlert.prefix": "Ko tō kohinga e tika ana mō te",
  "shiftAlert.shiftsTo": "ka huri ki te",
  "shiftAlert.error":
    "Kāore i taea te tirotiro i ngā panoni kohinga ā tōna wā. Whakamātauria anō.",
  "pushOptIn.label": "Ngā whakamahara kohinga i te pō i mua",
  "pushOptIn.status.checking": "E tirotiro ana i ō tautuhinga whakamōhio…",
  "pushOptIn.status.unsupported": "Kāore e taea ngā whakamōhio pana i tēnei pūtirotiro.",
  "pushOptIn.status.misconfigured": "Kāore anō kia wātea ngā whakamōhio pana.",
  "pushOptIn.status.unsubscribed": "Kāore koe e whiwhi whakamahara mō te pō i mua i te kohinga.",
  "pushOptIn.status.subscribing": "E whakakā ana i ngā whakamahara pō-i-mua…",
  "pushOptIn.status.subscribed": "Kei te whiwhi koe i ngā whakamahara pō-i-mua i te kohinga.",
  "pushOptIn.status.unsubscribing": "E weweke ana i ngā whakamahara pō-i-mua…",
  "pushOptIn.status.denied": "Kua ārai ngā whakamōhio mō tēnei pae. Whakaaetia ngā whakamōhio i ō tautuhinga pūtirotiro kia whiwhi whakamahara.",
  "pushOptIn.status.subscribeError": "Kāore i taea te whakakā i ngā whakamahara. Tēnā koa, whakamātauria anō.",
  "pushOptIn.status.unsubscribeError": "Kāore i taea te weweke i ngā whakamahara. Tēnā koa, whakamātauria anō.",
};

export const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  mi,
};
