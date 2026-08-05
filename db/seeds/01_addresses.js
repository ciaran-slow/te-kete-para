/**
 * addresses: a representative, fixed sample of Wellington streets, suburbs,
 * council zones, the inner-city CBD night-collection flag
 * (architecture.md §2C, issue #10), which of WCC's two independently-phased
 * alternating recycling calendars (`recycling_calendar_group`, 1 or 2, ADR
 * 0042) each suburban row actually follows (ADR 0059, issue #102), and —
 * for every suburban row — which real WCC weekday its weekly kerbside
 * collection actually falls on (`collection_weekday`, 0-6 per
 * `Date#getUTCDay()`, ADR 0063, issue #117). Both are confirmed per-address
 * against WCC's live per-street lookup tool, `null` for every CBD/night-
 * collection row, which neither alternates glass/mixed nor collects on a
 * single weekday. Idempotent by delete-then-reinsert — see ADR 0012 for
 * why, including the FK-nulling trade-off this accepts on re-run against a
 * database that already has users/push_subscriptions pointing at a
 * previously-seeded address id.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function seed(knex) {
  await knex("addresses").del();
  await knex("addresses").insert([
    // CBD / Te Aro — inner-city night collection (5:30pm–10pm, PRD persona 2)
    { street_name: "Cuba Street", suburb: "Te Aro", zone: "zone-cbd", is_inner_city_night_collection: true, recycling_calendar_group: null, collection_weekday: null },
    { street_name: "Wakefield Street", suburb: "Te Aro", zone: "zone-cbd", is_inner_city_night_collection: true, recycling_calendar_group: null, collection_weekday: null },
    { street_name: "Dixon Street", suburb: "Te Aro", zone: "zone-cbd", is_inner_city_night_collection: true, recycling_calendar_group: null, collection_weekday: null },
    { street_name: "Courtenay Place", suburb: "Te Aro", zone: "zone-cbd", is_inner_city_night_collection: true, recycling_calendar_group: null, collection_weekday: null },
    { street_name: "Willis Street", suburb: "Wellington Central", zone: "zone-cbd", is_inner_city_night_collection: true, recycling_calendar_group: null, collection_weekday: null },
    // Eastern suburbs — standard kerbside, all confirmed WCC Calendar 1
    // (issue #102) and all confirmed Thursday collection (issue #117).
    // "Majoribanks Street" (corrected spelling, issue #125 — previously
    // seeded here as "Marjoribanks") represents WCC's suburban house-number
    // segment (odds 15-109, evens 20-104, streetId 8070); the street's other
    // segment (odds 1-13, evens 4-18, streetId 8069) is inner-city night
    // collection and is not seeded here (ADR 0059).
    { street_name: "Majoribanks Street", suburb: "Mount Victoria", zone: "zone-east", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 4 },
    { street_name: "Hataitai Road", suburb: "Hataitai", zone: "zone-east", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 4 },
    { street_name: "Oriental Parade", suburb: "Oriental Bay", zone: "zone-east", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 4 },
    // Southern suburbs — standard kerbside; Newtown is Calendar 1, Island Bay
    // and Mount Cook are Calendar 2 — zone-south is NOT one calendar (#102).
    // All four are confirmed Thursday collection (issue #117).
    { street_name: "Riddiford Street", suburb: "Newtown", zone: "zone-south", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 4 },
    { street_name: "Constable Street", suburb: "Newtown", zone: "zone-south", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 4 },
    { street_name: "The Parade", suburb: "Island Bay", zone: "zone-south", is_inner_city_night_collection: false, recycling_calendar_group: 2, collection_weekday: 4 },
    { street_name: "Adelaide Road", suburb: "Mount Cook", zone: "zone-south", is_inner_city_night_collection: false, recycling_calendar_group: 2, collection_weekday: 4 },
    // Western suburbs — standard kerbside; Karori and Kelburn are Calendar 1,
    // Brooklyn is Calendar 2 — zone-west is NOT one calendar (#102). Karori
    // and Brooklyn collect Wednesday, Kelburn collects Tuesday — zone-west
    // is NOT one collection weekday either (issue #117).
    { street_name: "Karori Road", suburb: "Karori", zone: "zone-west", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 3 },
    { street_name: "Kelburn Parade", suburb: "Kelburn", zone: "zone-west", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 2 },
    { street_name: "Brooklyn Road", suburb: "Brooklyn", zone: "zone-west", is_inner_city_night_collection: false, recycling_calendar_group: 2, collection_weekday: 3 },
    // Northern suburbs — standard kerbside; Thorndon is Calendar 2,
    // Johnsonville is Calendar 1 — zone-north is NOT one calendar (#102).
    // Thorndon collects Tuesday, Johnsonville collects Monday — zone-north
    // is NOT one collection weekday either (issue #117).
    { street_name: "Tinakori Road", suburb: "Thorndon", zone: "zone-north", is_inner_city_night_collection: false, recycling_calendar_group: 2, collection_weekday: 2 },
    { street_name: "Broderick Road", suburb: "Johnsonville", zone: "zone-north", is_inner_city_night_collection: false, recycling_calendar_group: 1, collection_weekday: 1 },
  ]);
};
