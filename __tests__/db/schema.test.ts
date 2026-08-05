import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../knexfile.js";
import createPushSubscriptions from "../../db/migrations/20260729100006_create_push_subscriptions.js";
import widenPushSubscriptionsEndpoint from "../../db/migrations/20260803120000_widen_push_subscriptions_endpoint_to_text.js";

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
      recycling_calendar_group: { nullable: true, defaultValue: null },
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
      keywords: { nullable: false, defaultValue: "''" },
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
      endpoint: { nullable: false, defaultValue: null, type: "text" },
      p256dh: { nullable: false, defaultValue: null },
      auth: { nullable: false, defaultValue: null },
      language_preference: { nullable: false, defaultValue: "'en'" },
      address_id: { nullable: true, defaultValue: null },
      created_at: { nullable: false, defaultValue: "CURRENT_TIMESTAMP" },
      updated_at: { nullable: false, defaultValue: "CURRENT_TIMESTAMP" },
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

  it("gives every column its documented nullability, default, and (where specified) type", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (const [table, spec] of Object.entries(SCHEMA)) {
      const info = await db(table).columnInfo();
      for (const [column, expected] of Object.entries(spec.columns)) {
        const columnInfo = info[column as keyof typeof info];
        const expectedType = (expected as { type?: string }).type;
        const actual: Record<string, unknown> = {
          table,
          column,
          nullable: columnInfo.nullable,
          defaultValue: columnInfo.defaultValue,
        };
        const wanted: Record<string, unknown> = {
          table,
          column,
          nullable: expected.nullable,
          defaultValue: expected.defaultValue,
        };
        if (expectedType !== undefined) {
          actual.type = columnInfo.type;
          wanted.type = expectedType;
        }
        expect(actual).toEqual(wanted);
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

  it("populates created_at and updated_at on insert without the caller supplying them, independently per row", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    const [firstId] = await db("push_subscriptions").insert({
      endpoint: "https://push.example/timestamp-a",
      p256dh: "key",
      auth: "auth",
    });
    const [secondId] = await db("push_subscriptions").insert({
      endpoint: "https://push.example/timestamp-b",
      p256dh: "key",
      auth: "auth",
    });

    const rows = await db("push_subscriptions")
      .whereIn("id", [firstId, secondId])
      .orderBy("id");

    for (const row of rows) {
      expect(row.created_at).toEqual(expect.any(String));
      expect(row.updated_at).toEqual(expect.any(String));
      // SQLite's CURRENT_TIMESTAMP is UTC; parsing without a "Z" suffix
      // would apply the process TZ (Pacific/Auckland, ADR 0017) instead.
      expect(Number.isNaN(Date.parse(`${row.created_at}Z`))).toBe(false);
    }

    // Not a single shared value reused across rows/columns — two distinct
    // inserts each get their own populated pair.
    expect(rows[0].created_at).toEqual(rows[0].updated_at);
    expect(rows[1].created_at).toEqual(rows[1].updated_at);
  });

  it("widening push_subscriptions.endpoint preserves rows, the unique index, and constraints across up and down", async () => {
    db = Knex(knexConfigs.test);
    // push_subscriptions.address_id references addresses(id); SQLite needs
    // the parent table to exist to plan the FK check even when address_id
    // itself is left null on insert.
    await db.schema.createTable("addresses", (t) => {
      t.increments("id");
    });
    await createPushSubscriptions.up(db);

    const longEndpoint = `https://fcm.googleapis.com/fcm/send/${"x".repeat(280)}`;
    await db("push_subscriptions").insert({
      endpoint: longEndpoint,
      p256dh: "key",
      auth: "auth",
    });

    // up: widened to text, long endpoint and constraints survive
    await widenPushSubscriptionsEndpoint.up(db);
    expect((await db("push_subscriptions").columnInfo("endpoint")).type).toBe(
      "text",
    );
    expect(await db("push_subscriptions").select("endpoint")).toEqual([
      { endpoint: longEndpoint },
    ]);
    const indexesAfterUp: IndexRow[] = await db.raw(
      "PRAGMA index_list(push_subscriptions)",
    );
    expect(
      indexesAfterUp.map((i) => ({ name: i.name, unique: i.unique })),
    ).toEqual([{ name: "push_subscriptions_endpoint_unique", unique: 1 }]);
    await expect(
      db("push_subscriptions").insert({
        endpoint: longEndpoint,
        p256dh: "key2",
        auth: "auth2",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
    await expect(
      db("push_subscriptions").insert({ p256dh: "key3", auth: "auth3" }),
    ).rejects.toThrow(/NOT NULL constraint failed/);

    // down: back to varchar(255), row and constraints still intact
    await widenPushSubscriptionsEndpoint.down(db);
    expect((await db("push_subscriptions").columnInfo("endpoint")).type).toBe(
      "varchar",
    );
    expect(await db("push_subscriptions").select("endpoint")).toEqual([
      { endpoint: longEndpoint },
    ]);

    // repetition: a second up/down cycle must not duplicate the index or
    // otherwise drift from the first cycle's end state
    await widenPushSubscriptionsEndpoint.up(db);
    await widenPushSubscriptionsEndpoint.down(db);
    const indexesAfterSecondCycle: IndexRow[] = await db.raw(
      "PRAGMA index_list(push_subscriptions)",
    );
    expect(
      indexesAfterSecondCycle.map((i) => ({ name: i.name, unique: i.unique })),
    ).toEqual([{ name: "push_subscriptions_endpoint_unique", unique: 1 }]);
    expect(await db("push_subscriptions").select("endpoint")).toEqual([
      { endpoint: longEndpoint },
    ]);
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
