/**
 * sorting_rules: item keys, bilingual descriptions, and WCC disposal
 * instructions (architecture.md §2C).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.createTable("sorting_rules", (t) => {
    t.increments("id");
    t.string("item_key").notNullable().unique();
    t.text("description_en").notNullable();
    t.text("description_mi").notNullable();
    t.text("disposal_instructions_en").notNullable();
    t.text("disposal_instructions_mi").notNullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("sorting_rules");
};
