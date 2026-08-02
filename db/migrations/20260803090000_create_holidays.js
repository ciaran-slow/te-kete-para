/**
 * holidays: NZ/Wellington public holidays relevant to WCC collection shifts
 * (vision.md §4B, architecture.md §2C). Deliberately carries no foreign key
 * to `addresses` or `schedules` — a public holiday date and its shift are
 * council-wide, not per-zone or per-address (ADR 0029). #23 ("Holiday shift
 * calculation logic") is expected to read this table and combine it with
 * `computeCollectionRuleSet` (src/lib/schedule/rules.ts) to populate
 * `schedules.is_holiday_override` / `schedules.original_date` rows — this
 * table is the input, not a replacement for those columns.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.createTable("holidays", (t) => {
    t.increments("id");
    t.date("holiday_date").notNullable().unique();
    t.string("name_en").notNullable();
    t.string("name_mi").notNullable();
    // Calendar days collection shifts by when it would otherwise fall on
    // this date. Always 1 for every currently-seeded row (WCC's published
    // "collection moves one day later" rule) but kept as a column, not a
    // hardcoded constant, so a future holiday needing a different offset is
    // a seed change, not a migration.
    t.integer("shift_days").notNullable().defaultTo(1);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("holidays");
};
