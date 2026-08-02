import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../../knexfile.js";

/**
 * db/seeds/03_holidays.js: the fixed 5-row NZ/Wellington public holiday
 * calendar for 2026 — the holidays that shift WCC collection days
 * (vision.md §4B, issue #22). Idempotency is delete-then-reinsert
 * (ADR 0012), which these tests pin down as deliberate behaviour: repeated
 * runs and destructive re-seed are asserted, not just documented. Unlike
 * addresses, no other table has a foreign key into holidays, so there is
 * no FK-nulling side effect to assert here.
 */
const SEEDED_ROW_COUNT = 5;

// The full holiday_date set, sorted. Pinning every date (not just a count)
// means a mistyped or dropped date fails loudly with a readable diff.
const SEEDED_HOLIDAY_DATES = [
  "2026-01-01",
  "2026-01-02",
  "2026-04-03",
  "2026-12-25",
  "2026-12-28",
];

describe("holidays seed", () => {
  let db: ReturnType<typeof Knex> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("seeds exactly 5 rows covering the 2026 collection-shifting holidays", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const [{ n }] = await db("holidays").count({ n: "*" });
    expect(n).toBe(SEEDED_ROW_COUNT);

    const dates = await db("holidays").pluck("holiday_date");
    expect([...dates].sort()).toEqual(SEEDED_HOLIDAY_DATES);

    const christmas = await db("holidays")
      .where({ holiday_date: "2026-12-25" })
      .select("name_en", "shift_days");
    expect(christmas).toEqual([
      { name_en: "Christmas Day", shift_days: 1 },
    ]);
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

  it("running the seed three times in a row leaves exactly 5 rows every time", async () => {
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
