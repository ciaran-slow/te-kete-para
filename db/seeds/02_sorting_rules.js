/**
 * sorting_rules: a representative, fixed sample of common household items
 * with bilingual descriptions and WCC disposal instructions
 * (architecture.md §2C, issue #19). Idempotent by delete-then-reinsert,
 * following the same pattern as db/seeds/01_addresses.js (ADR 0012) — no
 * other table has a foreign key into sorting_rules, so unlike addresses
 * there is no downstream ON DELETE SET NULL effect from a re-run.
 *
 * UNVERIFIED CONTENT — placeholder data, the same status as the schedule
 * epoch "pending real WCC calendar data" (architecture.md §2B, ADR 0016,
 * tracked by issue #59). Each caveat below has its own tracking issue,
 * and both block #21 (sorting search UI) surfacing this text to users:
 *
 * - Issue #70: the disposal instructions are drafted from the 2024
 *   national kerbside standardisation (Ministry for the Environment, in
 *   force 1 Feb 2024: aerosols, all lids, liquid paperboard, plastics
 *   3/4/6/7, and items under 50mm are excluded from kerbside recycling)
 *   and from Wellington City Council's published guidance ("What can go
 *   in kerbside recycling" and "Recycling crates", wellington.govt.nz —
 *   the glass crate takes clean glass bottles and jars only, no lids).
 *   wellington.govt.nz returns HTTP 403 to every direct fetch attempted
 *   (this pass and PR #68's verify pass both hit it; web.archive.org is
 *   also unreachable from this environment), so no row here has been
 *   confirmed against a live WCC page. This pass instead cross-checked
 *   every row against the national standard and search-engine-indexed
 *   WCC/council/industry sources, and corrected one row (paint-tin:
 *   Resene PaintWise is a manufacturer scheme, not a WCC service).
 *   Row-by-row sources:
 *     - pizza-box, coffee-cup: WCC "What can go in kerbside recycling"
 *       (indexed, not directly fetchable); grease/lining contamination
 *       corroborated by Hamilton City Council and Stuff/NZ Herald
 *       reporting.
 *     - aerosol-can: MfE 2024 standard (aerosols excluded nationwide);
 *       empty/depressurised-to-general-rubbish corroborated by Auckland
 *       Council and Palmerston North City Council guidance.
 *     - glass-bottle, plastic-bottle: WCC "Recycling crates" and "What
 *       can go in kerbside recycling" (indexed); Sustainability Trust's
 *       lid-recycling programme confirms lids are out of the kerbside
 *       stream regionally.
 *     - tin-can: MfE national tins-and-cans guidance plus Porirua City
 *       Council's "Recycling tips for lids" (fold/squash the lid inside
 *       the can) — the same standard WCC follows.
 *     - soft-plastic-bag: recycling.kiwi.nz store locator confirms
 *       Wellington-area supermarket drop-off points are still active.
 *     - polystyrene-packaging: MfE 2024 standard (EPS excluded
 *       nationwide); the WCC-transfer-station claim stays conditional
 *       ("check whether") because no source confirmed a dedicated
 *       line-item at Southern Landfill.
 *     - milk-carton: MfE 2024 standard (liquid paperboard excluded
 *       nationwide); saveBOARD/Wastebusters confirm the specialist
 *       drop-off alternative.
 *     - food-scraps: RNZ/Beehive reporting confirms central government
 *       scrapped the mandatory nationwide kerbside food-scraps rollout
 *       (Jan 2025); WCC's own "Let's Talk" waste-collection consultation
 *       (Key Proposal 2) shows a food/garden bin is still only proposed,
 *       not live, as of Aug 2026 — the existing wording holds.
 *     - household-batteries, light-bulb, small-e-waste: WCC's own
 *       "Household battery recycling", "Domestic hazardous waste", and
 *       "Electrical waste (ewaste)" pages (indexed, not fetchable) place
 *       these at the Southern Landfill hazardous/e-waste drop-off.
 *     - paint-tin: corrected this pass, see above.
 *     - textiles-clothing: WCC's own "Organisations that accept donated
 *       items" page (indexed, not fetchable).
 *   None of the above is a live-page fetch, so the caveat above stays
 *   until a live WCC fetch — or a human browsing the pages directly —
 *   confirms these rows first-hand.
 * - Issue #69: the Te Reo Māori text is a machine draft. Key vocabulary
 *   was checked against Te Aka (pātara "bottle", pūhiko "battery",
 *   rehu matūriki "aerosol", kōrekoreko "fluorescent"), but the full
 *   dataset still needs review by a fluent Te Reo Māori speaker before
 *   it ships to users.
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
        "He pouaka pizza hinu, he maha ngā wā ka paru i te hinu, i te tīhi hoki.",
      disposal_instructions_en:
        "If the box is greasy or has food stuck to it, put it in your general rubbish — food oil stops cardboard from being recycled. Clean, dry sections of the lid can go in your mixed recycling with other paper and cardboard.",
      disposal_instructions_mi:
        "Mehemea he hinu, he kai rānei kei runga, whakauruhia ki tō para whānui — mā te hinu kai e aukati ai te hangarua o te kāta. Ki te mā, ki te maroke hoki tētahi wāhanga o te uwhi, ka taea te whakauru ki tō rauemi hangarua me ērā atu pepa, kāta hoki.",
    },
    {
      item_key: "coffee-cup",
      description_en:
        "A single-use disposable coffee cup, usually lined with plastic.",
      description_mi:
        "He kapu kawhe kotahi noa te whakamahi, he kirihou tonu te whakapaipai o roto.",
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
        "He kēne rehu matūriki (hei tauira, te wai kakara tinana, te peita puhipuhi, te wai kakara whare), ahakoa kua watea, kāore rānei.",
      disposal_instructions_en:
        "Aerosol cans are not accepted in kerbside recycling under the 2024 national kerbside standard. Put completely empty cans in your general rubbish. If the can still contains product or you're unsure, take it to a WCC transfer station as hazardous waste — never puncture or burn it.",
      disposal_instructions_mi:
        "Kāore ngā kēne rehu matūriki e whakaaetia ki te hangarua ā-huarahi i raro i te paerewa ā-motu o te tau 2024. Whakauruhia ngā kēne kua tino watea ki tō para whānui. Mēnā kei roto tonu he rawa, kāore rānei koe i te mōhio, kawea ki tētahi teihana whakawhiti a WCC hei para mōrearea — kaua rawa e wero, e tahu rānei.",
    },
    {
      item_key: "glass-bottle",
      description_en:
        "A glass bottle or jar (drink bottles, sauce jars, jam jars).",
      description_mi:
        "He pātara karāhe, he ipu karāhe rānei (pātara inu, ipu ranu, ipu tiami).",
      disposal_instructions_en:
        "Give it a rinse, remove the lid, and place the bottle or jar in your fortnightly glass recycling crate — the crate takes glass bottles and jars only. Lids are not accepted in kerbside recycling, so put them in your general rubbish.",
      disposal_instructions_mi:
        "Horoia, tangohia te uwhi, ka whakauru ai i te pātara, i te ipu rānei ki tō kete karāhe hangarua e rua wiki ai — mō ngā pātara me ngā ipu karāhe anake te kete. Kāore ngā uwhi e whakaaetia ki te hangarua ā-huarahi, nō reira whakauruhia ki tō para whānui.",
    },
    {
      item_key: "plastic-bottle",
      description_en:
        "A plastic drink bottle (PET or HDPE), such as a water or soft drink bottle.",
      description_mi:
        "He pātara inu kirihou (PET, HDPE rānei), pēnei i te pātara wai, i te pātara inu reka rānei.",
      disposal_instructions_en:
        "Rinse it out and place it in your mixed recycling. Remove the lid first — lids are not accepted in kerbside recycling, so the lid goes in your general rubbish.",
      disposal_instructions_mi:
        "Horoia, ka whakauru ai ki tō rauemi hangarua. Tangohia te uwhi i te tuatahi — kāore ngā uwhi e whakaaetia ki te hangarua ā-huarahi, nō reira ka haere te uwhi ki tō para whānui.",
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
        "He uwhi kirihou pahuka (polystyrene), pēnei i ngā pereti mīti, ngā wāhanga uwhi tiaki rānei.",
      disposal_instructions_en:
        "Polystyrene is not accepted in kerbside recycling. Put it in your general rubbish, or check whether your nearest WCC transfer station has a dedicated foam recycling drop-off.",
      disposal_instructions_mi:
        "Kāore te kirihou pahuka (polystyrene) e whakaaetia ki te hangarua ā-huarahi. Whakauruhia ki tō para whānui, tirohia rānei mēnā he wāhi hangarua motuhake mō te kirihou pahuka kei te teihana whakawhiti a WCC e tata ana ki a koe.",
    },
    {
      item_key: "milk-carton",
      description_en:
        "A liquid paperboard carton for milk or juice (e.g. Tetra Pak).",
      description_mi:
        "He pouaka pepa mō te waiū, mō te wai hua rānei (hei tauira, Tetra Pak).",
      disposal_instructions_en:
        "Liquid paperboard cartons are not accepted in kerbside recycling under the 2024 national kerbside standard. Put them in your general rubbish, or rinse and flatten them and take them to a specialist drop-off point (such as saveBOARD) if one is available.",
      disposal_instructions_mi:
        "Kāore ngā pouaka pepa mō te wai e whakaaetia ki te hangarua ā-huarahi i raro i te paerewa ā-motu o te tau 2024. Whakauruhia ki tō para whānui, horoia rānei, whakaparetia, ka kawe ai ki tētahi wāhi tuku motuhake (pēnei i a saveBOARD) mēnā kei reira tētahi.",
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
        "Whakaputahia hei wairākau mēnā ka taea. Kāore anō te kohinga ā-huarahi a Te Kaunihera o Pōneke i whai pēke toenga kai, nō reira ko ngā mea kāore e taea te whakaputa hei wairākau ka haere ki te para whānui.",
    },
    {
      item_key: "household-batteries",
      description_en:
        "Household batteries — AA, AAA, button cell, or rechargeable.",
      description_mi:
        "Ngā pūhiko kāinga — AA, AAA, pūhiko pātene, pūhiko whakahou rānei.",
      disposal_instructions_en:
        "Never put batteries in your kerbside bins — they're a fire risk in rubbish trucks. Take them to a battery recycling drop-off point or a WCC transfer station.",
      disposal_instructions_mi:
        "Kaua rawa e whakauru pūhiko ki ō kete ā-huarahi — he mōrearea ahi ki roto i ngā taraka para. Kawea ki tētahi wāhi hangarua pūhiko, ki tētahi teihana whakawhiti a WCC rānei.",
    },
    {
      item_key: "light-bulb",
      description_en:
        "A light bulb — LED, incandescent, or fluorescent/CFL.",
      description_mi:
        "He rama iti — LED, whakakā mūmura, kōrekoreko/CFL rānei.",
      disposal_instructions_en:
        "Fluorescent and CFL bulbs contain mercury and must never go in kerbside bins. Take all bulb types to a WCC transfer station or a participating retailer for recycling.",
      disposal_instructions_mi:
        "Kei roto i ngā rama kōrekoreko, CFL hoki he konutai, nō reira kaua rawa e whakaurua ki ngā kete ā-huarahi. Kawea ngā momo rama katoa ki tētahi teihana whakawhiti a WCC, ki tētahi toa e whai wāhi ana rānei, hei hangarua.",
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
        "Never put paint tins with leftover paint in your kerbside bins. Take them to a Resene PaintWise collection centre (any brand accepted, Resene-brand paint is free) or drop them off as domestic hazardous waste at WCC's Southern Landfill (free up to 20kg/20L). An empty, fully dried tin can go in your mixed recycling.",
      disposal_instructions_mi:
        "Kaua rawa e whakauru kēne peita whai toenga ki ō kete ā-huarahi. Kawea ki tētahi pokapū kohi peita a Resene PaintWise (ka whakaaetia ngā momo peita katoa, kāore he utu mō te peita a Resene), ki te teihana whakawhiti Southern Landfill a WCC rānei hei para mōrearea kāinga (kore utu tae atu ki te 20kg/20L). Ka taea e te kēne watea, kua maroke katoa te whakauru ki tō rauemi hangarua.",
    },
    {
      item_key: "textiles-clothing",
      description_en: "Old clothing, sheets, or other textiles.",
      description_mi:
        "He kākahu tawhito, he uwhi moenga, he kaupapa kākahu kē atu rānei.",
      disposal_instructions_en:
        "Donate anything still wearable to an op shop. Worn-out textiles can go in your general rubbish, or a dedicated textile recycling bin where one is available.",
      disposal_instructions_mi:
        "Tukuna ngā mea e taea tonu ana te mau ki tētahi toa hokohoko (op shop). Ka taea ngā kākahu kua ngenge te whakauru ki tō para whānui, ki tētahi pēke hangarua kākahu motuhake rānei mēnā kei reira tētahi.",
    },
  ]);
};
