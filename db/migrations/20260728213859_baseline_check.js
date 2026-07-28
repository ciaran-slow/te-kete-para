/**
 * Smoke-test migration for the Knex pipeline. `_baseline_check` is deliberately
 * not one of the six product tables (architecture.md §2C) — it exists only to
 * prove migrate up/down works end to end.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.createTable("_baseline_check", (t) => {
    t.increments("id");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("_baseline_check");
};
