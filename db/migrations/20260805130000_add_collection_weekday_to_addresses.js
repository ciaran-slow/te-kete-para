/**
 * addresses.collection_weekday: which real WCC weekday a suburban
 * address's weekly kerbside collection falls on (0-6, `Date#getUTCDay()`
 * convention: 0 = Sunday ... 6 = Saturday), or `null` for inner-city
 * night-collection addresses (which collect every night, not one weekday)
 * and any suburban address not yet confirmed. Confirmed per-address
 * against WCC's live per-street lookup tool, not derived from `zone` (ADR
 * 0063, issue #117) — mirrors the `recycling_calendar_group` column's own
 * per-address precedent (ADR 0059, issue #102).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.alterTable("addresses", (t) => {
    t.integer("collection_weekday").nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.alterTable("addresses", (t) => {
    t.dropColumn("collection_weekday");
  });
};
