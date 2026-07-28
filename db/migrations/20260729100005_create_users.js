/**
 * users: language toggle and address foreign key (architecture.md §2C).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.createTable("users", (t) => {
    t.increments("id");
    t.string("language_preference").notNullable().defaultTo("en");
    t.integer("address_id").references("id").inTable("addresses").onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("users");
};
