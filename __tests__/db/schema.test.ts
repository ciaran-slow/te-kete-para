import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../knexfile.js";

/**
 * The full shape each core table is expected to have — not just column names.
 * `defaultValue` strings are quoted exactly as SQLite reports them back
 * through `columnInfo()` (a boolean `false` default reads as `"'0'"`).
 */
const SCHEMA = {
  addresses: {
    columns: {
      id: { nullable: false, defaultValue: null },
      street_name: { nullable: false, defaultValue: null },
      suburb: { nullable: false, defaultValue: null },
      zone: { nullable: false, defaultValue: null },
      is_inner_city_night_collection: { nullable: false, defaultValue: "'0'" },
    },
    indexes: [
      { name: "addresses_street_name_index", unique: false },
      { name: "addresses_zone_index", unique: false },
    ],
    foreignKeys: [],
  },
  schedules: {
    columns: {
      id: { nullable: false, defaultValue: null },
      zone: { nullable: false, defaultValue: null },
      collection_date: { nullable: false, defaultValue: null },
      waste_type: { nullable: false, defaultValue: null },
      is_recycling_week: { nullable: false, defaultValue: "'0'" },
      is_holiday_override: { nullable: false, defaultValue: "'0'" },
      original_date: { nullable: true, defaultValue: null },
    },
    indexes: [{ name: "schedules_zone_collection_date_index", unique: false }],
    foreignKeys: [],
  },
  i18n_strings: {
    columns: {
      id: { nullable: false, defaultValue: null },
      key: { nullable: false, defaultValue: null },
      en: { nullable: false, defaultValue: null },
      mi: { nullable: false, defaultValue: null },
    },
    indexes: [{ name: "i18n_strings_key_unique", unique: true }],
    foreignKeys: [],
  },
  sorting_rules: {
    columns: {
      id: { nullable: false, defaultValue: null },
      item_key: { nullable: false, defaultValue: null },
      description_en: { nullable: false, defaultValue: null },
      description_mi: { nullable: false, defaultValue: null },
      disposal_instructions_en: { nullable: false, defaultValue: null },
      disposal_instructions_mi: { nullable: false, defaultValue: null },
    },
    indexes: [{ name: "sorting_rules_item_key_unique", unique: true }],
    foreignKeys: [],
  },
  users: {
    columns: {
      id: { nullable: false, defaultValue: null },
      language_preference: { nullable: false, defaultValue: "'en'" },
      address_id: { nullable: true, defaultValue: null },
    },
    indexes: [],
    foreignKeys: [
      { from: "address_id", table: "addresses", to: "id", on_delete: "SET NULL" },
    ],
  },
  push_subscriptions: {
    columns: {
      id: { nullable: false, defaultValue: null },
      endpoint: { nullable: false, defaultValue: null },
      p256dh: { nullable: false, defaultValue: null },
      auth: { nullable: false, defaultValue: null },
      language_preference: { nullable: false, defaultValue: "'en'" },
      address_id: { nullable: true, defaultValue: null },
    },
    indexes: [{ name: "push_subscriptions_endpoint_unique", unique: true }],
    foreignKeys: [
      { from: "address_id", table: "addresses", to: "id", on_delete: "SET NULL" },
    ],
  },
  holidays: {
    columns: {
      id: { nullable: false, defaultValue: null },
      holiday_date: { nullable: false, defaultValue: null },
      name_en: { nullable: false, defaultValue: null },
      name_mi: { nullable: false, defaultValue: null },
      shift_days: { nullable: false, defaultValue: "'1'" },
    },
    indexes: [{ name: "holidays_holiday_date_unique", unique: true }],
    foreignKeys: [],
  },
};

type IndexRow = { name: string; unique: number };
type ForeignKeyRow = {
  from: string;
  table: string;
  to: string;
  on_delete: string;
};

describe("core schema migrations", () => {
  let db: ReturnType<typeof Knex> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("creates all seven core tables with exactly their expected columns", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (const [table, spec] of Object.entries(SCHEMA)) {
      expect(await db.schema.hasTable(table)).toBe(true);
      const info = await db(table).columnInfo();
      expect(Object.keys(info).sort()).toEqual(Object.keys(spec.columns).sort());
    }
  });

  it("gives every column its documented nullability and default", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (const [table, spec] of Object.entries(SCHEMA)) {
      const info = await db(table).columnInfo();
      for (const [column, expected] of Object.entries(spec.columns)) {
        expect({
          table,
          column,
          nullable: info[column as keyof typeof info].nullable,
          defaultValue: info[column as keyof typeof info].defaultValue,
        }).toEqual({
          table,
          column,
          nullable: expected.nullable,
          defaultValue: expected.defaultValue,
        });
      }
    }
  });

  it("creates the documented indexes and unique constraints", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (const [table, spec] of Object.entries(SCHEMA)) {
      const rows: IndexRow[] = await db.raw("PRAGMA index_list(??)", [table]);
      const actual = rows
        .map((r) => ({ name: r.name, unique: r.unique === 1 }))
        .sort((a, b) => a.name.localeCompare(b.name));
      const expected = [...spec.indexes].sort((a, b) =>
        a.name.localeCompare(b.name),
      );
      expect(actual).toEqual(expected);
    }
  });

  it("declares address foreign keys with SET NULL on delete", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (const [table, spec] of Object.entries(SCHEMA)) {
      const rows: ForeignKeyRow[] = await db.raw(
        "PRAGMA foreign_key_list(??)",
        [table],
      );
      const actual = rows.map((r) => ({
        from: r.from,
        table: r.table,
        to: r.to,
        on_delete: r.on_delete,
      }));
      expect(actual).toEqual(spec.foreignKeys);
    }
  });

  it("enforces foreign keys at runtime instead of only declaring them", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    // SQLite defaults `PRAGMA foreign_keys` to OFF, which silently reduces
    // every references()/onDelete() clause above to documentation.
    const [pragma] = await db.raw("PRAGMA foreign_keys");
    expect(pragma).toEqual({ foreign_keys: 1 });

    await expect(db("users").insert({ address_id: 99999 })).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
    await expect(
      db("push_subscriptions").insert({
        endpoint: "https://push.example/orphan",
        p256dh: "key",
        auth: "auth",
        address_id: 99999,
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/);
  });

  it("nulls address references when the referenced address is deleted", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    const [addressId] = await db("addresses").insert({
      street_name: "Cuba Street",
      suburb: "Te Aro",
      zone: "zone-a",
    });
    await db("users").insert({ address_id: addressId });
    await db("push_subscriptions").insert({
      endpoint: "https://push.example/cuba",
      p256dh: "key",
      auth: "auth",
      address_id: addressId,
    });

    await db("addresses").where({ id: addressId }).del();

    expect(await db("users").select("address_id")).toEqual([
      { address_id: null },
    ]);
    expect(await db("push_subscriptions").select("address_id")).toEqual([
      { address_id: null },
    ]);
  });

  it("rejects duplicate values in the columns declared unique", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    const subscription = {
      endpoint: "https://push.example/duplicate",
      p256dh: "key",
      auth: "auth",
    };
    await db("push_subscriptions").insert(subscription);
    await expect(db("push_subscriptions").insert(subscription)).rejects.toThrow(
      /UNIQUE constraint failed/,
    );

    await db("i18n_strings").insert({
      key: "bin.rubbish",
      en: "Rubbish",
      mi: "Para",
    });
    await expect(
      db("i18n_strings").insert({ key: "bin.rubbish", en: "Trash", mi: "Para" }),
    ).rejects.toThrow(/UNIQUE constraint failed/);

    const rule = {
      item_key: "pizza-box",
      description_en: "Pizza box",
      description_mi: "Pouaka parehe",
      disposal_instructions_en: "Rubbish if greasy",
      disposal_instructions_mi: "Para mēnā he hinu",
    };
    await db("sorting_rules").insert(rule);
    await expect(db("sorting_rules").insert(rule)).rejects.toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("rejects rows missing a required column", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    await expect(
      db("addresses").insert({ street_name: "Cuba Street", zone: "zone-a" }),
    ).rejects.toThrow(/NOT NULL constraint failed/);
    await expect(
      db("schedules").insert({ zone: "zone-a", waste_type: "rubbish" }),
    ).rejects.toThrow(/NOT NULL constraint failed/);
  });

  it("rolls back and re-migrates all seven core tables cleanly (up -> down -> up)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.migrate.rollback();

    for (const table of Object.keys(SCHEMA)) {
      expect(await db.schema.hasTable(table)).toBe(false);
    }

    await db.migrate.latest();

    for (const table of Object.keys(SCHEMA)) {
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

  it("rolling back a second time after a full rollback is a safe no-op", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    // The first rollback actually runs all seven down() functions; the second
    // has nothing left in the batch and must no-op rather than throw.
    const [firstBatch, firstLog] = await db.migrate.rollback();
    expect(firstBatch).toBe(1);
    expect(firstLog.length).toBeGreaterThan(0);

    const [secondBatch, secondLog] = await db.migrate.rollback();
    expect(secondBatch).toBe(0);
    expect(secondLog).toEqual([]);
    expect(await db.schema.hasTable("addresses")).toBe(false);
  });
});
