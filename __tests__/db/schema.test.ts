import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../knexfile.js";

const EXPECTED_COLUMNS = {
  addresses: [
    "id",
    "street_name",
    "suburb",
    "zone",
    "is_inner_city_night_collection",
  ],
  schedules: [
    "id",
    "zone",
    "collection_date",
    "waste_type",
    "is_recycling_week",
    "is_holiday_override",
    "original_date",
  ],
  i18n_strings: ["id", "key", "en", "mi"],
  sorting_rules: [
    "id",
    "item_key",
    "description_en",
    "description_mi",
    "disposal_instructions_en",
    "disposal_instructions_mi",
  ],
  users: ["id", "language_preference", "address_id"],
  push_subscriptions: [
    "id",
    "endpoint",
    "p256dh",
    "auth",
    "language_preference",
    "address_id",
  ],
};

describe("core schema migrations", () => {
  let db: ReturnType<typeof Knex> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("creates all six core tables with their expected columns", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (const [table, columns] of Object.entries(EXPECTED_COLUMNS)) {
      expect(await db.schema.hasTable(table)).toBe(true);
      const info = await db(table).columnInfo();
      for (const column of columns) {
        expect(info).toHaveProperty(column);
      }
    }
  });

  it("rolls back and re-migrates all six core tables cleanly (up -> down -> up)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.migrate.rollback();

    for (const table of Object.keys(EXPECTED_COLUMNS)) {
      expect(await db.schema.hasTable(table)).toBe(false);
    }

    await db.migrate.latest();

    for (const table of Object.keys(EXPECTED_COLUMNS)) {
      expect(await db.schema.hasTable(table)).toBe(true);
    }
  });

  it("running migrate.latest() three times in a row only applies the schema once", async () => {
    db = Knex(knexConfigs.test);
    const [firstBatch] = await db.migrate.latest();
    const [secondBatch, secondLog] = await db.migrate.latest();
    const [thirdBatch, thirdLog] = await db.migrate.latest();

    expect(firstBatch).toBe(1);
    expect(secondBatch).toBe(1);
    expect(thirdBatch).toBe(1);
    expect(secondLog).toEqual([]);
    expect(thirdLog).toEqual([]);
    expect(await db.schema.hasTable("addresses")).toBe(true);
  });

  it("rolling back twice in a row from a clean state is a safe no-op both times", async () => {
    db = Knex(knexConfigs.test);
    const [firstBatch, firstLog] = await db.migrate.rollback();
    const [secondBatch, secondLog] = await db.migrate.rollback();

    expect(firstBatch).toBe(0);
    expect(firstLog).toEqual([]);
    expect(secondBatch).toBe(0);
    expect(secondLog).toEqual([]);
  });
});
