/**
 * addresses.is_inner_city_night_collection: widens NOT NULL DEFAULT false to
 * nullable. A bulk-imported street (issue #178) whose CBD/night-collection
 * status hasn't been checked against WCC's live per-street lookup tool must
 * be representable as genuinely unresolved, not defaulted to `false` — a
 * defaulted `false` would make computeCollectionRuleSet (rules.ts) compute a
 * plausible-looking but potentially wrong suburban schedule for a street
 * that is actually inner-city, instead of honestly refusing to guess. Same
 * rationale ADR 0059/ADR 0068 already applied to recycling_calendar_group.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.alterTable("addresses", (t) => {
    t.boolean("is_inner_city_night_collection").nullable().alter();
  });
};

/**
 * Down backfills any existing NULL to `false` before restoring the NOT NULL
 * constraint — required for the down migration to actually succeed once any
 * row has been seeded with a NULL value, per architecture.md's "every
 * migration has a working down" gate. This is an explicit, one-time
 * rollback fabrication (unlike the live app, which never guesses `false`),
 * accepted because a `down()` that fails against real data is worse.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  await knex("addresses")
    .whereNull("is_inner_city_night_collection")
    .update({ is_inner_city_night_collection: false });
  return knex.schema.alterTable("addresses", (t) => {
    t.boolean("is_inner_city_night_collection").notNullable().defaultTo(false).alter();
  });
};
