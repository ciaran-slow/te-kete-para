/**
 * addresses.recycling_calendar_group: which of WCC's two independently-
 * phased alternating recycling calendars (ADR 0042) a suburban address
 * actually follows — 1, 2, or null for inner-city night-collection
 * addresses, which do not alternate glass/mixed. Confirmed per-address
 * against WCC's live per-street lookup tool, not derived from `zone`
 * (ADR 0059, issue #102).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.alterTable("addresses", (t) => {
    t.integer("recycling_calendar_group").nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.alterTable("addresses", (t) => {
    t.dropColumn("recycling_calendar_group");
  });
};
