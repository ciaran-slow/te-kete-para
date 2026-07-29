// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupTestDb, teardownTestDb } from "../helpers/api";

const CORE_TABLES = [
  "addresses",
  "schedules",
  "i18n_strings",
  "sorting_rules",
  "users",
  "push_subscriptions",
];

describe("in-memory database test harness", () => {
  let db: Awaited<ReturnType<typeof setupTestDb>>;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("applies every core migration", async () => {
    for (const table of CORE_TABLES) {
      expect(await db.schema.hasTable(table)).toBe(true);
    }
  });

  it("starts empty — no rows leak in from another test file", async () => {
    expect(await db("addresses").count({ count: "*" })).toEqual([{ count: 0 }]);
  });

  it("keeps the foreign-key pragma on through the helper's instance", async () => {
    // Built from knexfile.js so pool.afterCreate applies the pragma; a
    // hand-rolled config would silently revert to unenforced FKs.
    const [pragma] = await db.raw("PRAGMA foreign_keys");
    expect(pragma).toEqual({ foreign_keys: 1 });
  });

  it("enforces foreign keys on writes made through the helper", async () => {
    await expect(db("users").insert({ address_id: 99999 })).rejects.toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it("is idempotent on repeat setup calls and never wipes existing fixtures", async () => {
    await db("addresses").insert({
      street_name: "Cuba Street",
      suburb: "Te Aro",
      zone: "zone-a",
    });

    // Downstream fixtures (#11, #25) would be stranded if a second setup call
    // re-created or re-migrated the database.
    expect(await setupTestDb()).toBe(db);
    expect(await setupTestDb()).toBe(db);

    expect(await db("addresses").count({ count: "*" })).toEqual([{ count: 1 }]);
  });
});
