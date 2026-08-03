import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../../knexfile.js";

/**
 * db/seeds/03_holidays.js: the fixed 3-row NZ/Wellington public holiday
 * calendar for 2026 — the holidays that shift WCC collection days
 * (vision.md §4B, issue #78, ADR 0038). Idempotency is delete-then-reinsert
 * (ADR 0012), which these tests pin down as deliberate behaviour: repeated
 * runs and destructive re-seed are asserted, not just documented. Unlike
 * addresses, no other table has a foreign key into holidays, so there is
 * no FK-nulling side effect to assert here.
 */
const SEEDED_ROW_COUNT = 3;

// Every seeded row in full, sorted by holiday_date. Pinning all columns of
// all rows (not a count, and not one sample row) means a mistyped date,
// name, or shift on ANY row fails loudly with a readable diff — a
// single-row spot check was proven mutable without failing the suite.
const SEEDED_HOLIDAYS = [
  {
    holiday_date: "2026-01-01",
    name_en: "New Year's Day",
    name_mi: "Te Rā Tau Hou",
    shift_days: 2,
  },
  {
    holiday_date: "2026-04-03",
    name_en: "Good Friday",
    name_mi: "Te Paraire Pai",
    shift_days: 1,
  },
  {
    holiday_date: "2026-12-25",
    name_en: "Christmas Day",
    name_mi: "Te Rā Kirihimete",
    shift_days: 1,
  },
];

describe("holidays seed", () => {
  let db: ReturnType<typeof Knex> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("seeds exactly the 3 pinned 2026 collection-shifting holiday rows", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const rows = await db("holidays")
      .select("holiday_date", "name_en", "name_mi", "shift_days")
      .orderBy("holiday_date", "asc");
    expect(rows).toEqual(SEEDED_HOLIDAYS);
    expect(rows).toHaveLength(SEEDED_ROW_COUNT);
  });

  it("every row has non-empty, distinct English and Te Reo Māori names", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const rows = await db("holidays").select(
      "holiday_date",
      "name_en",
      "name_mi",
    );
    expect(rows).toHaveLength(SEEDED_ROW_COUNT);
    for (const row of rows) {
      // Non-empty on every row: an empty translation on any row is a
      // delivery failure for the bilingual alerts this table feeds
      // (#23/#24), same rationale as sorting-rules.test.ts.
      expect(row.name_en.length).toBeGreaterThan(0);
      expect(row.name_mi.length).toBeGreaterThan(0);
      // Distinctness guards against the mi column being a copy of en. With
      // the non-empty assertions above, "" no longer passes trivially.
      expect(row.name_en).not.toBe(row.name_mi);
    }
  });

  it("rejects when run before the holidays table has been migrated", async () => {
    db = Knex(knexConfigs.test);
    // `specific` targets this seed file: a plain seed.run() against an
    // unmigrated database rejects on 01_addresses.js ("no such table:
    // addresses") before the holidays seed ever executes.
    await expect(db.seed.run({ specific: "03_holidays.js" })).rejects.toThrow(
      /no such table: holidays/,
    );
  });

  it("rejects a second row duplicating an already-seeded holiday_date", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    await expect(
      db("holidays").insert({
        holiday_date: "2026-12-25",
        name_en: "Christmas Day (duplicate)",
        name_mi: "Te Rā Kirihimete (tāruarua)",
      }),
    ).rejects.toThrow(/UNIQUE constraint failed/);
  });

  it("rejects rows missing a required column", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    await expect(
      db("holidays").insert({
        holiday_date: "2026-06-01",
        name_mi: "Te Rā o Matariki",
      }),
    ).rejects.toThrow(/NOT NULL constraint failed/);
  });

  it("running the seed three times in a row leaves exactly 3 rows every time", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (let run = 1; run <= 3; run += 1) {
      await db.seed.run();
      const [{ n }] = await db("holidays").count({ n: "*" });
      expect({ run, n }).toEqual({ run, n: SEEDED_ROW_COUNT });
    }
  });

  it("re-seeding wipes rows added since the last run (ADR 0012)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    await db("holidays").insert({
      holiday_date: "2026-06-19",
      name_en: "Test Holiday",
      name_mi: "He Hararei Whakamātau",
    });
    const [{ n: beforeReseed }] = await db("holidays").count({ n: "*" });
    expect(beforeReseed).toBe(SEEDED_ROW_COUNT + 1);

    await db.seed.run();

    const [{ n }] = await db("holidays").count({ n: "*" });
    expect(n).toBe(SEEDED_ROW_COUNT);
    expect(
      await db("holidays").where({ holiday_date: "2026-06-19" }),
    ).toEqual([]);
  });
});
