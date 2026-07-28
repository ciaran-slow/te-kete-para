/**
 * push_subscriptions: Web Push tokens, language preference, and address
 * reference (architecture.md §2C; issue #25 reads/writes this table
 * directly — no users FK).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function up(knex) {
  return knex.schema.createTable("push_subscriptions", (t) => {
    t.increments("id");
    t.string("endpoint").notNullable().unique();
    t.string("p256dh").notNullable();
    t.string("auth").notNullable();
    t.string("language_preference").notNullable().defaultTo("en");
    t.integer("address_id").references("id").inTable("addresses").onDelete("SET NULL");
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function down(knex) {
  return knex.schema.dropTableIfExists("push_subscriptions");
};
