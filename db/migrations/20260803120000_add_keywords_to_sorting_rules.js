/**
 * sorting_rules.keywords: curated synonym/alternate-form search terms per
 * row, added to GET /api/sorting/search's match scope alongside item_key
 * and the bilingual descriptions (ADR 0033) — a narrow, author-curated way
 * to close known recall gaps (e.g. "battery" vs. seeded "batteries")
 * without pulling the verbose disposal_instructions_* text into scope,
 * which ADR 0025 Alternative B flagged as turning common queries into a
 * table dump.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.alterTable("sorting_rules", (t) => {
    t.text("keywords").notNullable().defaultTo("");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.alterTable("sorting_rules", (t) => {
    t.dropColumn("keywords");
  });
};
