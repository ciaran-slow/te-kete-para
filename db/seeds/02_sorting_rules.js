/**
 * sorting_rules: a representative, fixed sample of common household items
 * with bilingual descriptions and WCC disposal instructions
 * (architecture.md §2C, issue #19). Idempotent by delete-then-reinsert,
 * following the same pattern as db/seeds/01_addresses.js (ADR 0012) — no
 * other table has a foreign key into sorting_rules, so unlike addresses
 * there is no downstream ON DELETE SET NULL effect from a re-run.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function seed(knex) {
  await knex("sorting_rules").del();
  await knex("sorting_rules").insert([
    {
      item_key: "pizza-box",
      description_en: "A greasy pizza box, often stained with oil and cheese.",
      description_mi:
        "He pouaka pizza hinu, he maha ngā wā he toto hinu, he tīhi hoki e piri ana.",
      disposal_instructions_en:
        "If the box is greasy or has food stuck to it, put it in your general rubbish — food oil stops cardboard from being recycled. Clean, dry sections of the lid can go in your kerbside cardboard collection.",
      disposal_instructions_mi:
        "Mehemea he hinu, he kai rānei kei runga, whakauruhia ki tō para whānui — mā te hinu kai e aukati ai te hangarua o te kāta. Ki te mā, ki te maroke hoki tētahi wāhanga o te uwhi, ka taea te whakauru ki tō kohinga kāta ā-huarahi.",
    },
    {
      item_key: "coffee-cup",
      description_en:
        "A single-use disposable coffee cup, usually lined with plastic.",
      description_mi:
        "He kapu kawhe waiwai kotahi noa te whakamahi, he kirihou tonu te whakapaipai o roto.",
      disposal_instructions_en:
        "Put the whole cup, including the lid, in your general rubbish — the plastic lining cannot be separated by WCC's recycling plant. Bring a reusable cup next time to avoid this waste.",
      disposal_instructions_mi:
        "Whakauruhia te kapu me tōna uwhi katoa ki tō para whānui — kāore e taea e te wheketere hangarua a WCC te wehewehe i te kirihou o roto. Kawea mai he kapu whakamahi anō ā muri ake nei kia kore ai tēnei para e puta.",
    },
    {
      item_key: "aerosol-can",
      description_en:
        "An aerosol spray can (e.g. deodorant, spray paint, air freshener), empty or full.",
      description_mi:
        "He kēne hau pungahou (hei tauira, te wai kakara tinana, te peita puhipuhi, te wai kakara whare), ahakoa kua watea, kāhore rānei.",
      disposal_instructions_en:
        "Only empty, fully depressurised cans go in your mixed recycling. If the can still contains product or you're unsure, take it to a WCC transfer station as hazardous waste — never puncture or burn it.",
      disposal_instructions_mi:
        "Ko ngā kēne kua watea, kua kore hoki he pungatanga anake ka whakaurua ki tō rauemi hangarua. Mēnā kei roto tonu he rawa, kāore rānei koe i te mōhio, kawea ki tētahi teihana whakawhiti a WCC hei para mōrearea — kaua rawa e wero, e tahu rānei.",
    },
    {
      item_key: "glass-bottle",
      description_en:
        "A glass bottle or jar (drink bottles, sauce jars, jam jars).",
      description_mi:
        "He pounamu karāhe, he ipu karāhe rānei (pounamu inu, ipu ranu, ipu tiami).",
      disposal_instructions_en:
        "Give it a rinse and place it in your fortnightly glass recycling crate. Remove the lid and put that in your mixed recycling instead.",
      disposal_instructions_mi:
        "Horoia, ka whakauru ai ki tō kete karāhe hangarua e rua wiki ai. Tangohia te uwhi ka whakauru ai ki tō rauemi hangarua.",
    },
    {
      item_key: "plastic-bottle",
      description_en:
        "A plastic drink bottle (PET or HDPE), such as a water or soft drink bottle.",
      description_mi:
        "He pounamu kirihou inu (PET, HDPE rānei), pēnei i te pounamu wai, pounamu inu reka rānei.",
      disposal_instructions_en:
        "Rinse it out, put the lid back on, and place it in your mixed recycling.",
      disposal_instructions_mi:
        "Horoia, whakahokia te uwhi, ka whakauru ai ki tō rauemi hangarua.",
    },
    {
      item_key: "tin-can",
      description_en: "A steel or aluminium food or drink can.",
      description_mi:
        "He kēne rino, konganuku rānei mō te kai, mō te inu rānei.",
      disposal_instructions_en:
        "Rinse it out and place it in your mixed recycling. Fold any sharp lid edges inward so it's safe to handle.",
      disposal_instructions_mi:
        "Horoia, ka whakauru ai ki tō rauemi hangarua. Whakapikoa ngā tapa koi o te uwhi ki roto kia haumaru ai te hopu.",
    },
    {
      item_key: "soft-plastic-bag",
      description_en:
        "A soft plastic shopping bag, bread bag, or rubbish bag.",
      description_mi:
        "He pēke kirihou ngohengohe, pēke taro, pēke para rānei.",
      disposal_instructions_en:
        "Never put soft plastics in your kerbside recycling — they jam the sorting machinery. Reuse them where you can, or drop them off at a soft-plastic recycling point at participating supermarkets.",
      disposal_instructions_mi:
        "Kaua rawa e whakauru i ngā kirihou ngohengohe ki tō rauemi hangarua ā-huarahi — ka aukatihia e rātou ngā mīhini wehewehe. Whakamahia anō mēnā ka taea, whakaurua rānei ki tētahi wāhi hangarua kirihou ngohengohe kei ētahi toa nui e whai wāhi ana.",
    },
    {
      item_key: "polystyrene-packaging",
      description_en:
        "Polystyrene foam packaging, such as meat trays or protective packing pieces.",
      description_mi:
        "He uwhi puehu porohita, pēnei i ngā pereti mīti, ngā wāhanga uwhi tiaki rānei.",
      disposal_instructions_en:
        "Polystyrene is not accepted in kerbside recycling. Put it in your general rubbish, or check whether your nearest WCC transfer station has a dedicated foam recycling drop-off.",
      disposal_instructions_mi:
        "Kāore te porohita e whakaaetia ki te rauemi hangarua ā-huarahi. Whakauruhia ki tō para whānui, tirohia rānei mēnā he wāhi hangarua porohita motuhake kei te teihana whakawhiti a WCC e tata ana ki a koe.",
    },
    {
      item_key: "milk-carton",
      description_en:
        "A liquid paperboard carton for milk or juice (e.g. Tetra Pak).",
      description_mi:
        "He pouaka pepa mō te waiū, mō te wai hua rānei (hei tauira, Tetra Pak).",
      disposal_instructions_en:
        "Rinse and flatten the carton, then place it in your kerbside cardboard collection.",
      disposal_instructions_mi:
        "Horoia, whakaparetia te pouaka, ka whakauru ai ki tō kohinga kāta ā-huarahi.",
    },
    {
      item_key: "food-scraps",
      description_en:
        "Food scraps and kitchen waste left over from cooking or meals.",
      description_mi:
        "Ngā toenga kai me te para kīhini i mahue mai i te tunu kai, i ngā kai rānei.",
      disposal_instructions_en:
        "Compost at home if you can. Wellington City Council's kerbside collection does not currently include a food scraps bin, so anything you can't compost goes in general rubbish.",
      disposal_instructions_mi:
        "Whakaputahia hei wairākau mēnā ka taea. Kāore anō te kohinga ā-huarahi a Te Kaunihera o Pōneke i whai pēke toenga kai, nō reira ko ngā mea kāore e taea te whakawairākau ka haere ki te para whānui.",
    },
    {
      item_key: "household-batteries",
      description_en:
        "Household batteries — AA, AAA, button cell, or rechargeable.",
      description_mi:
        "Ngā pātete kāinga — AA, AAA, pātete pātene, pātete whakahou rānei.",
      disposal_instructions_en:
        "Never put batteries in your kerbside bins — they're a fire risk in rubbish trucks. Take them to a battery recycling drop-off point or a WCC transfer station.",
      disposal_instructions_mi:
        "Kaua rawa e whakauru pātete ki ō kete ā-huarahi — he mōrea ahi ki roto i ngā taraka para. Kawea ki tētahi wāhi hangarua pātete, ki tētahi teihana whakawhiti a WCC rānei.",
    },
    {
      item_key: "light-bulb",
      description_en:
        "A light bulb — LED, incandescent, or fluorescent/CFL.",
      description_mi: "He rama iti — LED, whakakā mūmura, huka rānei/CFL.",
      disposal_instructions_en:
        "Fluorescent and CFL bulbs contain mercury and must never go in kerbside bins. Take all bulb types to a WCC transfer station or a participating retailer for recycling.",
      disposal_instructions_mi:
        "Kei roto i ngā rama huka, CFL hoki he konutai, nō reira kaua rawa e whakaurua ki ngā kete ā-huarahi. Kawea ngā momo rama katoa ki tētahi teihana whakawhiti a WCC, ki tētahi toa e whai wāhi ana rānei, hei hangarua.",
    },
    {
      item_key: "small-e-waste",
      description_en:
        "A small electronic device, charger, or cable (e.g. an old phone or headphones).",
      description_mi:
        "He taputapu hiko iti, he pūrere whakakī, he taura rānei (hei tauira, he waea tawhito, he waea taringa rānei).",
      disposal_instructions_en:
        "Never put e-waste in your kerbside bins. Take it to a WCC transfer station e-waste drop-off or a retailer take-back scheme.",
      disposal_instructions_mi:
        "Kaua rawa e whakauru para hiko ki ō kete ā-huarahi. Kawea ki tētahi wāhi tuku para hiko kei tētahi teihana whakawhiti a WCC, ki tētahi kaupapa whakahoki-ki-te-toa rānei.",
    },
    {
      item_key: "paint-tin",
      description_en: "A tin of leftover paint, or an empty paint tin.",
      description_mi: "He kēne peita toenga, he kēne peita watea rānei.",
      disposal_instructions_en:
        "Never put paint tins with leftover paint in your kerbside bins — take them to a WCC paint recovery drop-off point. An empty, fully dried tin can go in your mixed recycling.",
      disposal_instructions_mi:
        "Kaua rawa e whakauru kēne peita whai toenga ki ō kete ā-huarahi — kawea ki tētahi wāhi whakahoki peita a WCC. Ka taea e te kēne watea, kua maroke katoa te whakauru ki tō rauemi hangarua.",
    },
    {
      item_key: "textiles-clothing",
      description_en: "Old clothing, sheets, or other textiles.",
      description_mi:
        "He kākahu tawhito, he uwhi moenga, he kaupapa kākahu kē atu rānei.",
      disposal_instructions_en:
        "Donate anything still wearable to an op shop. Worn-out textiles can go in your general rubbish, or a dedicated textile recycling bin where one is available.",
      disposal_instructions_mi:
        "Tukuna ngā mea e taea tonu ana te mau ki tētahi toa taonga tuku iho. Ka taea ngā kākahu kua ngenge te whakauru ki tō para whānui, ki tētahi pēke hangarua kākahu motuhake rānei mēnā kei reira tētahi.",
    },
  ]);
};
