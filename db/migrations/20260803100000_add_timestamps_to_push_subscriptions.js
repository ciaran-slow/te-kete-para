/**
 * Adds created_at/updated_at to push_subscriptions (issue #34) so the
 * nightly dispatcher (#27) can age out stale subscriptions and #25's
 * upsert-on-conflict write path can touch updated_at on re-subscribe.
 *
 * Added via a direct ALTER TABLE ADD COLUMN, not a table rebuild: SQLite
 * refuses NOT NULL + a non-constant default (CURRENT_TIMESTAMP) once a
 * table has rows, but push_subscriptions has none in any environment that
 * will run this migration — #25's write path does not exist yet (ADR 0033).
 * This migration must not be re-run against a populated table.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.alterTable("push_subscriptions", (t) => {
    t.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    t.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.alterTable("push_subscriptions", (t) => {
    t.dropColumn("updated_at");
    t.dropColumn("created_at");
  });
};
