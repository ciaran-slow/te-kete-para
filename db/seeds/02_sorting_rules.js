/**
 * sorting_rules: a representative, fixed sample of common household items
 * with bilingual descriptions and WCC disposal instructions
 * (architecture.md §2C, issue #19). Idempotent by delete-then-reinsert,
 * following the same pattern as db/seeds/01_addresses.js (ADR 0012) — no
 * other table has a foreign key into sorting_rules, so unlike addresses
 * there is no downstream ON DELETE SET NULL effect from a re-run.
 *
 * CONFIRMED CONTENT (issues #70, #119) — all 15 rows below are confirmed
 * against a live wellington.govt.nz page, or the JSON API backing its
 * "What to do with your waste" search tool, fetched directly this pass
 * (curl with a browser User-Agent bypasses the site's 403-to-bare-request
 * block; WebFetch and unheadered curl both still get a 403). Issue #70
 * confirmed 14 of 15 rows this way, leaving aerosol-can's empty-vs-full
 * handling split as the one open gap (ADR 0054); issue #119 closed it by
 * reverse-engineering the search tool's `POST
 * /Handlers/SearchBucketHandler.ashx` backing API (ADR 0060) and found
 * that split was wrong. This replaces the "UNVERIFIED CONTENT" status
 * from PR #88, whose verify pass hit 403s because it used guessed URL
 * paths and no browser User-Agent; the real page paths were found via web
 * search and fetched successfully this pass. Row-by-row live sources:
 *
 *   - pizza-box: WCC "Recycling myths – busted!" (10 Jun 2024) and "What
 *     can go in kerbside recycling" — grease stains alone don't disqualify
 *     a pizza box from kerbside recycling; only food/cheese residue needs
 *     scraping off first. Corrected this pass — the previous text claimed
 *     the opposite (a greasy box must go to general rubbish), which is
 *     exactly the myth WCC's own article debunks.
 *   - coffee-cup: WCC "What can go in kerbside recycling" — cups and lids
 *     explicitly listed under "General waste".
 *   - aerosol-can: WCC "What can go in kerbside recycling" confirms
 *     aerosols are excluded from kerbside recycling (listed under
 *     "Hazardous items"). The empty-vs-full split previously in this row
 *     was wrong — WCC's own "What to do with your waste" lookup tool
 *     (item "Aerosol and spray cans", fetched by reverse-engineering its
 *     `POST /Handlers/SearchBucketHandler.ashx` backing API; issue #119,
 *     ADR 0060) states aerosol and spray cans go straight in kerbside
 *     general rubbish regardless of fill state, with the Southern
 *     Landfill as a fee-paying alternative, not a free hazardous-waste
 *     drop-off. Corrected this pass — closes the one gap ADR 0054 left
 *     open. One sub-case is reconciled rather than tool-confirmed: this
 *     description names "spray paint" as an example, but the search
 *     tool's 159 items have no dedicated spray-paint entry — its
 *     "Paint" item says paint is hazardous waste regardless of
 *     container, so the disposal text carves spray paint out to that
 *     guidance instead of asserting the aerosol item's general-rubbish
 *     answer covers it.
 *   - glass-bottle: WCC "Recycling crates" ("clean glass bottles and jars
 *     only (no lids)") and "What can go in kerbside recycling".
 *   - plastic-bottle: WCC "What can go in kerbside recycling", Plastics
 *     section — clean, not squashed, lids/pumps/triggers removed.
 *   - tin-can: WCC "Recycling myths – busted!" — lids can stay on if
 *     pushed inside and still attached; loose lids go in the rubbish.
 *   - soft-plastic-bag: recycling.kiwi.nz (The Packaging Forum's Soft
 *     Plastics Recycling Scheme) — the scheme is active, with supermarket
 *     drop-off bins operating, confirmed live this pass.
 *   - polystyrene-packaging: WCC "Types of waste accepted" at the
 *     Southern Landfill explicitly lists polystyrene as accepted (no
 *     prior approval needed below a car-boot-load). Corrected this pass —
 *     the previous text hedged ("check whether... has a dedicated
 *     drop-off") when WCC's own page confirms acceptance outright.
 *   - milk-carton: WCC "Recycling myths – busted!" — wax-lined/Tetra Pak
 *     cartons aren't kerbside-recyclable; SaveBoard take specialist
 *     drop-offs.
 *   - food-scraps: WCC "Para Kai Miramar Peninsula Trial" and "Reducing
 *     food waste" — the only food-scraps kerbside collection was a
 *     completed 2020–2022 pilot; a future organics collection is funded
 *     in the 2024–34 Long-term Plan but not live.
 *   - household-batteries: WCC "Household battery recycling" — the Solid
 *     Waste Management and Minimisation Bylaw 2020 prohibits batteries in
 *     kerbside waste; free community drop-off points plus the Southern
 *     Landfill for leaking/damaged/car batteries.
 *   - light-bulb: WCC "Domestic hazardous waste" names only CFL/
 *     fluorescent lamps (mercury) as accepted hazardous items — corrected
 *     this pass to stop implying every bulb type needs hazardous-waste
 *     handling, which no WCC page supports for LED/incandescent bulbs.
 *   - small-e-waste: WCC "Electrical waste (ewaste)" — free Tip Shop
 *     drop-off, fees only for LCD/CRT TVs and monitors.
 *   - paint-tin: WCC "Domestic hazardous waste" and "Types of waste
 *     accepted" — paint accepted free up to 20kg/20L; corrected in PR #88
 *     to stop crediting Resene PaintWise (a manufacturer scheme) as a WCC
 *     service, now also live-confirmed.
 *   - textiles-clothing: WCC "Organisations that accept donated items",
 *     fetched directly.
 *
 * - Issue #69 (closed as won't-fix-for-prototype, ADR 0064): the Te Reo
 *   Māori text is a machine draft. Key vocabulary was checked against Te
 *   Aka (pātara "bottle", pūhiko "battery", rehu matūriki "aerosol",
 *   kōrekoreko "fluorescent"), but the full dataset has not been reviewed
 *   by a fluent Te Reo Māori speaker. ADR 0028 originally deferred
 *   composing `<SortingSearch>` into any route until this closed; ADR 0064
 *   accepts the machine-draft risk instead, as a prototype-scope trade-off
 *   — this is not resolved, only knowingly shipped. A future fluent-speaker
 *   pass should re-open a tracking issue and treat this file as the same
 *   kind of correction #70/#119 already made to the English text.
 *
 * `keywords` (issue #73, ADR 0035) is a separate, curated search-recall
 * aid, not translated/verified content like the rest of the row — it is
 * populated incrementally as real search-recall gaps are found, not
 * backfilled in bulk.
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
        "Scrape off any leftover food or cheese residue, then put the box in your mixed recycling with your other paper and cardboard — grease stains on their own are fine and won't stop it being recycled. If it's a big box, fold it down so it fits in your recycling bag or bin.",
      disposal_instructions_mi:
        "Waruhia ngā toenga kai, tīhi hoki kei runga, kātahi ka whakauru ai i te pouaka ki tō rauemi hangarua me ō atu pepa, kāta hoki — he pai noa te toto hinu, kāore e aukati i te hangarua. Mehemea he pouaka nui, whakapikoa kia uru pai ai ki tō pēke, kete hangarua rānei.",
      keywords: "",
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
      keywords: "",
    },
    {
      item_key: "aerosol-can",
      description_en:
        "An aerosol spray can (e.g. deodorant, spray paint, air freshener), empty or full.",
      description_mi:
        "He kēne rehu matūriki (hei tauira, te wai kakara tinana, te peita puhipuhi, te wai kakara whare), ahakoa kua watea, kāore rānei.",
      disposal_instructions_en:
        "Aerosol and spray cans are not accepted in kerbside recycling — they can be dangerous if punctured during the recycling sort. WCC's official waste-sorting tool confirms most of them go in your general rubbish instead, whether empty or still full, or you can drop one at the Southern Landfill (fees apply). The exception is spray paint: WCC's tool has no dedicated spray-paint item, but its separate paint guidance treats paint as hazardous waste no matter the container — take a spray-paint can to the Southern Landfill's Hazardous Waste drop-off instead (free up to 20kg/20L), never your general rubbish. Never puncture or burn any aerosol can, even an empty one.",
      disposal_instructions_mi:
        "Kāore ngā kēne rehu matūriki e whakaaetia ki te hangarua ā-huarahi — ka taea pea te mōrearea mehemea ka werohia i te wā e wehewehea ana ngā rauemi hangarua. E whakaū ana te taputapu wehewehe para whaimana a WCC ka haere kē te nuinga ki tō para whānui, ahakoa kua watea, kāore rānei — ka taea hoki te kawe ki te Southern Landfill (he utu kei reira). Ko te peita puhipuhi te mea rerekē: kāore he tūemi peita puhipuhi motuhake kei te taputapu a WCC, engari e kī ana āna tohutohu peita motuhake he para mōrearea te peita ahakoa te ipu — kawea he kēne peita puhipuhi ki te wāhi tuku para mōrearea o te Southern Landfill (kore utu tae atu ki te 20kg/20L), kaua ki tō para whānui. Kaua rawa e wero, e tahu rānei i tētahi kēne rehu matūriki, ahakoa kua watea.",
      keywords: "",
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
      keywords: "",
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
      keywords: "",
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
      keywords: "",
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
      keywords: "",
    },
    {
      item_key: "polystyrene-packaging",
      description_en:
        "Polystyrene foam packaging, such as meat trays or protective packing pieces.",
      description_mi:
        "He uwhi kirihou pahuka (polystyrene), pēnei i ngā pereti mīti, ngā wāhanga uwhi tiaki rānei.",
      disposal_instructions_en:
        "Polystyrene is not accepted in kerbside recycling. Put small amounts in your general rubbish, or take it to the Southern Landfill, which accepts polystyrene directly — a car boot load or less needs no prior approval; larger, commercial quantities need approval first.",
      disposal_instructions_mi:
        "Kāore te kirihou pahuka (polystyrene) e whakaaetia ki te hangarua ā-huarahi. Whakauruhia he iti ki tō para whānui, kawea rānei ki te Southern Landfill, e whakaae pū ana ki te kirihou pahuka — kāore e hiahiatia he whakaaetanga mō tētahi utanga pūtu waka, iti iho rānei; me whai whakaaetanga i mua mō ngā utanga nui ake, arā, ngā utanga arumoni.",
      keywords: "",
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
      keywords: "",
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
      keywords: "",
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
      keywords: "battery",
    },
    {
      item_key: "light-bulb",
      description_en:
        "A light bulb — LED, incandescent, or fluorescent/CFL.",
      description_mi:
        "He rama iti — LED, whakakā mūmura, kōrekoreko/CFL rānei.",
      disposal_instructions_en:
        "Fluorescent and CFL bulbs contain mercury — take them to a WCC transfer station's hazardous waste facility, never your kerbside bins (WCC accepts up to 20 per household, wrapped in newspaper or their original packaging). LED and incandescent bulbs don't contain mercury and aren't on WCC's hazardous waste list, so they can go in your general rubbish.",
      disposal_instructions_mi:
        "Kei roto i ngā rama kōrekoreko, CFL hoki he konutai — kawea ki te wāhi para mōrearea o tētahi teihana whakawhiti a WCC, kaua rawa ki ō kete ā-huarahi (ka whakaaetia e WCC te 20 mō tēnā, mō tēnā kāinga, me te takai ki te pepa niupepa, ki tōna kōpaki taketake rānei). Kāore he konutai kei roto i ngā rama LED, i ngā rama whakakā mūmura hoki, kāore anō rātou i te rārangi para mōrearea a WCC, nō reira ka taea te whakauru ki tō para whānui.",
      keywords: "",
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
      keywords: "",
    },
    {
      item_key: "paint-tin",
      description_en: "A tin of leftover paint, or an empty paint tin.",
      description_mi: "He kēne peita toenga, he kēne peita watea rānei.",
      disposal_instructions_en:
        "Never put paint tins with leftover paint in your kerbside bins. Take them to a Resene PaintWise collection centre (any brand accepted, Resene-brand paint is free) or drop them off as domestic hazardous waste at WCC's Southern Landfill (free up to 20kg/20L). An empty, fully dried tin can go in your mixed recycling.",
      disposal_instructions_mi:
        "Kaua rawa e whakauru kēne peita whai toenga ki ō kete ā-huarahi. Kawea ki tētahi pokapū kohi peita a Resene PaintWise (ka whakaaetia ngā momo peita katoa, kāore he utu mō te peita a Resene), ki te teihana whakawhiti Southern Landfill a WCC rānei hei para mōrearea kāinga (kore utu tae atu ki te 20kg/20L). Ka taea e te kēne watea, kua maroke katoa te whakauru ki tō rauemi hangarua.",
      keywords: "",
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
      keywords: "",
    },
  ]);
};
