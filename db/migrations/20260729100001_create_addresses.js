/**
 * addresses: Wellington street indices, council zones, and suburb
 * classifications (architecture.md §2C).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.createTable("addresses", (t) => {
    t.increments("id");
    t.string("street_name").notNullable();
    t.string("suburb").notNullable();
    t.string("zone").notNullable();
    t.boolean("is_inner_city_night_collection").notNullable().defaultTo(false);
    t.index("street_name");
    t.index("zone");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("addresses");
};
