/**
 * Widens push_subscriptions.endpoint from varchar(255) to text: Web Push
 * endpoint URLs are vendor-controlled and not contractually bounded (issue
 * #35, raised by the verify pass on #2/#25). SQLite ignores varchar length,
 * so this changes nothing about today's data — it removes a portability
 * footgun against a stricter engine or mode.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.alterTable("push_subscriptions", (t) => {
    t.text("endpoint").notNullable().alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.alterTable("push_subscriptions", (t) => {
    t.string("endpoint").notNullable().alter();
  });
};
