/**
 * addresses: a representative, fixed sample of Wellington streets, suburbs,
 * council zones, and the inner-city CBD night-collection flag
 * (architecture.md §2C, issue #10). Idempotent by delete-then-reinsert —
 * see ADR 0012 for why, including the FK-nulling trade-off this accepts on
 * re-run against a database that already has users/push_subscriptions
 * pointing at a previously-seeded address id.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function seed(knex) {
  await knex("addresses").del();
  await knex("addresses").insert([
    // CBD / Te Aro — inner-city night collection (5:30pm–10pm, PRD persona 2)
    { street_name: "Cuba Street", suburb: "Te Aro", zone: "zone-cbd", is_inner_city_night_collection: true },
    { street_name: "Wakefield Street", suburb: "Te Aro", zone: "zone-cbd", is_inner_city_night_collection: true },
    { street_name: "Dixon Street", suburb: "Te Aro", zone: "zone-cbd", is_inner_city_night_collection: true },
    { street_name: "Courtenay Place", suburb: "Te Aro", zone: "zone-cbd", is_inner_city_night_collection: true },
    { street_name: "Willis Street", suburb: "Wellington Central", zone: "zone-cbd", is_inner_city_night_collection: true },
    // Eastern suburbs — standard kerbside
    { street_name: "Marjoribanks Street", suburb: "Mount Victoria", zone: "zone-east", is_inner_city_night_collection: false },
    { street_name: "Hataitai Road", suburb: "Hataitai", zone: "zone-east", is_inner_city_night_collection: false },
    { street_name: "Oriental Parade", suburb: "Oriental Bay", zone: "zone-east", is_inner_city_night_collection: false },
    // Southern suburbs — standard kerbside
    { street_name: "Riddiford Street", suburb: "Newtown", zone: "zone-south", is_inner_city_night_collection: false },
    { street_name: "Constable Street", suburb: "Newtown", zone: "zone-south", is_inner_city_night_collection: false },
    { street_name: "The Parade", suburb: "Island Bay", zone: "zone-south", is_inner_city_night_collection: false },
    { street_name: "Adelaide Road", suburb: "Mount Cook", zone: "zone-south", is_inner_city_night_collection: false },
    // Western suburbs — standard kerbside
    { street_name: "Karori Road", suburb: "Karori", zone: "zone-west", is_inner_city_night_collection: false },
    { street_name: "Kelburn Parade", suburb: "Kelburn", zone: "zone-west", is_inner_city_night_collection: false },
    { street_name: "Brooklyn Road", suburb: "Brooklyn", zone: "zone-west", is_inner_city_night_collection: false },
    // Northern suburbs — standard kerbside
    { street_name: "Tinakori Road", suburb: "Thorndon", zone: "zone-north", is_inner_city_night_collection: false },
    { street_name: "Broderick Road", suburb: "Johnsonville", zone: "zone-north", is_inner_city_night_collection: false },
  ]);
};
