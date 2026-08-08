import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../../knexfile.js";
// scripts/import-wellington-streets.js is a plain Node CommonJS script (run
// manually with `node`, not bundled) — imported here (mirroring knexfile.js's
// own default-import CJS interop above) only for its normalizeForComparison
// helper, so this test exercises the exact same normalization the import
// script itself uses to exclude curated rows.
import importScriptExports from "../../../scripts/import-wellington-streets.js";

const { normalizeForComparison } = importScriptExports;

/**
 * db/seeds/01_addresses.js: a two-tier registry (issue #178, ADR 0075) — the
 * 17 curated rows (5 CBD night-collection, Te Aro + Wellington Central; 12
 * standard kerbside across the east/south/west/north zones, all with a
 * fully confirmed classification), plus a much larger set of bulk-imported
 * rows sourced from WCC's own street-search registry, each genuinely
 * unresolved (`zone: "zone-unconfirmed"`, the other three fields `null`).
 * The exact bulk-import count depends on the live script run (§2, ADR 0075)
 * and isn't hardcoded here — these tests assert properties (present,
 * unresolved, deduped) rather than a magic total. Idempotency is
 * delete-then-reinsert (ADR 0012), which these tests pin down as deliberate
 * behaviour: repeated runs, destructive re-seed, and the FK-nulling side
 * effect are all asserted, not just documented.
 */
const CURATED_ROW_COUNT = 17;

describe("addresses seed", () => {
  let db: ReturnType<typeof Knex> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("seeds the 17 curated rows unchanged, including Cuba Street as CBD night collection", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    // Curated rows are exactly the ones with a resolved (non-null)
    // is_inner_city_night_collection — bulk-imported rows always have null
    // there (ADR 0075) — so this scopes to "curated" without hardcoding a
    // street-name list.
    const [{ n }] = await db("addresses")
      .whereNotNull("is_inner_city_night_collection")
      .count({ n: "*" });
    expect(n).toBe(CURATED_ROW_COUNT);

    // The sqlite3 driver returns SQLite's boolean-as-INTEGER storage as 0/1
    // on a plain select — confirmed empirically against this driver, and
    // consistent with the `defaultValue: "'0'"` columnInfo() assertion in
    // schema.test.ts for the same column.
    const cubaStreet = await db("addresses")
      .where({ street_name: "Cuba Street" })
      .select("suburb", "zone", "is_inner_city_night_collection");
    expect(cubaStreet).toEqual([
      {
        suburb: "Te Aro",
        zone: "zone-cbd",
        is_inner_city_night_collection: 1,
      },
    ]);
  });

  it("seeds strictly more than the 17 curated rows now that WCC's full street registry is bulk-imported (issue #178)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const [{ n }] = await db("addresses").count({ n: "*" });
    expect(n).toBeGreaterThan(CURATED_ROW_COUNT);
  });

  it("every bulk-imported row has zone: zone-unconfirmed and every classification field null (issue #178, ADR 0075)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const bulkRows = await db("addresses").whereNull("is_inner_city_night_collection");
    expect(bulkRows.length).toBeGreaterThan(0);
    for (const row of bulkRows) {
      expect(row.zone).toBe("zone-unconfirmed");
      expect(row.is_inner_city_night_collection).toBeNull();
      expect(row.recycling_calendar_group).toBeNull();
      expect(row.collection_weekday).toBeNull();
    }
  });

  it("has no duplicate (street_name, suburb) pair anywhere in the table, curated or bulk-imported", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const duplicates = await db("addresses")
      .select("street_name", "suburb")
      .count({ n: "*" })
      .groupBy("street_name", "suburb")
      .havingRaw("count(*) > 1");
    expect(duplicates).toEqual([]);
  });

  it("no bulk-imported row shadows a curated row under a WCC suburb abbreviation (e.g. Mt vs Mount) (issue #178 verify finding)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const curatedRows = await db("addresses")
      .whereNotNull("is_inner_city_night_collection")
      .select("street_name", "suburb");
    const curatedKeys = new Set(
      curatedRows.map((r) =>
        JSON.stringify([
          normalizeForComparison(r.street_name),
          normalizeForComparison(r.suburb),
        ]),
      ),
    );

    const bulkRows = await db("addresses")
      .whereNull("is_inner_city_night_collection")
      .select("street_name", "suburb");
    const shadowedRows = bulkRows.filter((r) =>
      curatedKeys.has(
        JSON.stringify([
          normalizeForComparison(r.street_name),
          normalizeForComparison(r.suburb),
        ]),
      ),
    );

    expect(shadowedRows).toEqual([]);

    // Specific regression fixtures for the exact collision the verify pass
    // found live: "Mt Victoria"/"Mt Cook" (WCC's abbreviation) must not
    // exist as a second, unresolved row alongside the curated "Mount
    // Victoria"/"Mount Cook" spelling for the same street.
    expect(
      await db("addresses").where({
        street_name: "Majoribanks Street",
        suburb: "Mt Victoria",
      }),
    ).toEqual([]);
    expect(
      await db("addresses").where({
        street_name: "Adelaide Road",
        suburb: "Mt Cook",
      }),
    ).toEqual([]);
  });

  it("includes a real, non-curated street confirmed present in the live import (Wadestown Road, Wadestown) with unresolved classification", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const rows = await db("addresses").where({
      street_name: "Wadestown Road",
      suburb: "Wadestown",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].zone).toBe("zone-unconfirmed");
    expect(rows[0].is_inner_city_night_collection).toBeNull();
    expect(rows[0].recycling_calendar_group).toBeNull();
    expect(rows[0].collection_weekday).toBeNull();
  });

  it("represents both classifications: 5 CBD night-collection rows, 12 standard", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const [{ n: nightCollection }] = await db("addresses")
      .where({ is_inner_city_night_collection: true })
      .count({ n: "*" });
    const [{ n: standardKerbside }] = await db("addresses")
      .where({ is_inner_city_night_collection: false })
      .count({ n: "*" });
    expect(nightCollection).toBe(5);
    expect(standardKerbside).toBe(12);
  });

  it("the 17 curated rows span all five council zones and 13 distinct suburbs", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    // Scoped to curated rows: bulk-imported rows all carry the sentinel
    // "zone-unconfirmed" (ADR 0075) and span hundreds of real suburbs, which
    // would otherwise swamp this assertion.
    const zones = await db("addresses")
      .whereNotNull("is_inner_city_night_collection")
      .distinct("zone");
    expect(zones.map((row) => row.zone).sort()).toEqual([
      "zone-cbd",
      "zone-east",
      "zone-north",
      "zone-south",
      "zone-west",
    ]);

    const suburbs = await db("addresses")
      .whereNotNull("is_inner_city_night_collection")
      .distinct("suburb");
    expect(suburbs).toHaveLength(13);
  });

  it("bulk-imported rows introduce the zone-unconfirmed sentinel and many more suburbs than the curated 13 (issue #178)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const unconfirmedZoneCount = await db("addresses")
      .where({ zone: "zone-unconfirmed" })
      .count({ n: "*" })
      .first();
    expect(Number(unconfirmedZoneCount?.n)).toBeGreaterThan(0);

    const allSuburbs = await db("addresses").distinct("suburb");
    expect(allSuburbs.length).toBeGreaterThan(13);
  });

  it("carries each suburban row's WCC-confirmed recyclingCalendarGroup, and null for every CBD row (issue #102)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const rows = await db("addresses").select(
      "street_name",
      "suburb",
      "recycling_calendar_group",
    );
    const byStreet = new Map(
      rows.map((r) => [`${r.street_name}, ${r.suburb}`, r.recycling_calendar_group]),
    );

    expect(byStreet.get("Majoribanks Street, Mount Victoria")).toBe(1);
    expect(byStreet.get("Hataitai Road, Hataitai")).toBe(1);
    expect(byStreet.get("Oriental Parade, Oriental Bay")).toBe(1);
    expect(byStreet.get("Riddiford Street, Newtown")).toBe(1);
    expect(byStreet.get("Constable Street, Newtown")).toBe(1);
    expect(byStreet.get("The Parade, Island Bay")).toBe(2);
    expect(byStreet.get("Adelaide Road, Mount Cook")).toBe(2);
    expect(byStreet.get("Karori Road, Karori")).toBe(1);
    expect(byStreet.get("Kelburn Parade, Kelburn")).toBe(1);
    expect(byStreet.get("Brooklyn Road, Brooklyn")).toBe(2);
    expect(byStreet.get("Tinakori Road, Thorndon")).toBe(2);
    expect(byStreet.get("Broderick Road, Johnsonville")).toBe(1);

    const cbdRows = await db("addresses")
      .where({ is_inner_city_night_collection: true })
      .select("recycling_calendar_group");
    expect(cbdRows).toHaveLength(5);
    for (const row of cbdRows) {
      expect(row.recycling_calendar_group).toBeNull();
    }
  });

  it("shows zone-south, zone-west, and zone-north each mix both calendar groups, contradicting a zone-level default (issue #102)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    for (const zone of ["zone-south", "zone-west", "zone-north"]) {
      const groups = await db("addresses")
        .where({ zone })
        .distinct("recycling_calendar_group");
      expect(groups.map((g) => g.recycling_calendar_group).sort()).toEqual([1, 2]);
    }

    const zoneEastGroups = await db("addresses")
      .where({ zone: "zone-east" })
      .distinct("recycling_calendar_group");
    expect(zoneEastGroups.map((g) => g.recycling_calendar_group)).toEqual([1]);
  });

  it("carries each suburban row's WCC-confirmed collectionWeekday, and null for every CBD row (issue #117)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const rows = await db("addresses").select(
      "street_name",
      "suburb",
      "collection_weekday",
    );
    const byStreet = new Map(
      rows.map((r) => [`${r.street_name}, ${r.suburb}`, r.collection_weekday]),
    );

    expect(byStreet.get("Majoribanks Street, Mount Victoria")).toBe(4);
    expect(byStreet.get("Hataitai Road, Hataitai")).toBe(4);
    expect(byStreet.get("Oriental Parade, Oriental Bay")).toBe(4);
    expect(byStreet.get("Riddiford Street, Newtown")).toBe(4);
    expect(byStreet.get("Constable Street, Newtown")).toBe(4);
    expect(byStreet.get("The Parade, Island Bay")).toBe(4);
    expect(byStreet.get("Adelaide Road, Mount Cook")).toBe(4);
    expect(byStreet.get("Karori Road, Karori")).toBe(3);
    expect(byStreet.get("Kelburn Parade, Kelburn")).toBe(2);
    expect(byStreet.get("Brooklyn Road, Brooklyn")).toBe(3);
    expect(byStreet.get("Tinakori Road, Thorndon")).toBe(2);
    expect(byStreet.get("Broderick Road, Johnsonville")).toBe(1);

    const cbdRows = await db("addresses")
      .where({ is_inner_city_night_collection: true })
      .select("collection_weekday");
    expect(cbdRows).toHaveLength(5);
    for (const row of cbdRows) {
      expect(row.collection_weekday).toBeNull();
    }
  });

  it("shows zone-west and zone-north each mix collection weekdays, contradicting a zone-level default (issue #117)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    for (const zone of ["zone-west", "zone-north"]) {
      const weekdays = await db("addresses")
        .where({ zone })
        .distinct("collection_weekday");
      expect(weekdays.map((w) => w.collection_weekday).sort()).toHaveLength(2);
    }

    const zoneEastWeekdays = await db("addresses")
      .where({ zone: "zone-east" })
      .distinct("collection_weekday");
    expect(zoneEastWeekdays.map((w) => w.collection_weekday)).toEqual([4]);
  });

  it("rejects when run before the addresses table has been migrated", async () => {
    db = Knex(knexConfigs.test);
    await expect(db.seed.run()).rejects.toThrow(/no such table: addresses/);
  });

  it("running the seed three times in a row leaves the exact same total row count and curated/unconfirmed split every time", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    let expectedTotal: number | undefined;
    let expectedCurated: number | undefined;
    let expectedUnconfirmed: number | undefined;

    for (let run = 1; run <= 3; run += 1) {
      await db.seed.run();
      const [{ n: total }] = await db("addresses").count({ n: "*" });
      const [{ n: curated }] = await db("addresses")
        .whereNotNull("is_inner_city_night_collection")
        .count({ n: "*" });
      const [{ n: unconfirmed }] = await db("addresses")
        .whereNull("is_inner_city_night_collection")
        .count({ n: "*" });

      if (run === 1) {
        expectedTotal = Number(total);
        expectedCurated = Number(curated);
        expectedUnconfirmed = Number(unconfirmed);
        expect(expectedCurated).toBe(CURATED_ROW_COUNT);
        expect(expectedTotal).toBeGreaterThan(CURATED_ROW_COUNT);
      } else {
        expect({ run, total: Number(total) }).toEqual({ run, total: expectedTotal });
        expect({ run, curated: Number(curated) }).toEqual({ run, curated: expectedCurated });
        expect({ run, unconfirmed: Number(unconfirmed) }).toEqual({
          run,
          unconfirmed: expectedUnconfirmed,
        });
      }
    }
  });

  it("re-seeding deliberately wipes rows added since the last run (ADR 0012)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const [{ n: seededTotal }] = await db("addresses").count({ n: "*" });

    await db("addresses").insert({
      street_name: "Test Street",
      suburb: "Test Suburb",
      zone: "zone-test",
    });
    const [{ n: beforeReseed }] = await db("addresses").count({ n: "*" });
    expect(Number(beforeReseed)).toBe(Number(seededTotal) + 1);

    await db.seed.run();

    const [{ n }] = await db("addresses").count({ n: "*" });
    expect(Number(n)).toBe(Number(seededTotal));
    expect(
      await db("addresses").where({ street_name: "Test Street" }),
    ).toEqual([]);
  });

  it("re-seeding nulls existing address references via ON DELETE SET NULL (ADR 0012)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const cubaStreet = await db("addresses")
      .where({ street_name: "Cuba Street" })
      .first("id");
    if (!cubaStreet) throw new Error("seed did not insert Cuba Street");
    await db("users").insert({ address_id: cubaStreet.id });

    await db.seed.run();

    expect(await db("users").select("address_id")).toEqual([
      { address_id: null },
    ]);
  });
});
