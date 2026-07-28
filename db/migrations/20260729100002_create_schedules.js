/**
 * schedules: date-mapped bin collection calendars, alternating recycling
 * flags, and holiday override rules (architecture.md §2C). `zone` is a
 * loose string match against addresses.zone, not a DB foreign key — many
 * addresses share one zone, so zone is not a candidate key.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.createTable("schedules", (t) => {
    t.increments("id");
    t.string("zone").notNullable();
    t.date("collection_date").notNullable();
    t.string("waste_type").notNullable();
    t.boolean("is_recycling_week").notNullable().defaultTo(false);
    t.boolean("is_holiday_override").notNullable().defaultTo(false);
    t.date("original_date");
    t.index(["zone", "collection_date"]);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("schedules");
};
