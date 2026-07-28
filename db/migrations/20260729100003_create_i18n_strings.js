/**
 * i18n_strings: relational translation keys with explicit English (en) and
 * Te Reo Māori (mi) text columns (architecture.md §2C).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.createTable("i18n_strings", (t) => {
    t.increments("id");
    t.string("key").notNullable().unique();
    t.text("en").notNullable();
    t.text("mi").notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("i18n_strings");
};
