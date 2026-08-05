/**
 * Adds an optional client-supplied wall-clock ordering token to
 * push_subscriptions (issue #140, ADR 0067) so a write for a given
 * `endpoint` can be compared against the most recent write already
 * accepted for that row before applying it — closing the gap where two
 * in-flight address-change resubscribes complete at the server in a
 * different order than the client sent them.
 *
 * Nullable, no default: a write that omits it keeps today's unconditional
 * last-write-wins behavior for that one write (ADR 0067).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.alterTable("push_subscriptions", (t) => {
    t.bigInteger("client_requested_at").nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.alterTable("push_subscriptions", (t) => {
    t.dropColumn("client_requested_at");
  });
};
