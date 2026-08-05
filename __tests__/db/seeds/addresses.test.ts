import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../../knexfile.js";

/**
 * db/seeds/01_addresses.js: the fixed 17-row Wellington reference sample —
 * 5 CBD night-collection rows (Te Aro + Wellington Central) and 12 standard
 * kerbside rows across the east/south/west/north zones. Idempotency is
 * delete-then-reinsert (ADR 0012), which these tests pin down as deliberate
 * behaviour: repeated runs, destructive re-seed, and the FK-nulling side
 * effect are all asserted, not just documented.
 */
const SEEDED_ROW_COUNT = 17;

describe("addresses seed", () => {
  let db: ReturnType<typeof Knex> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("seeds exactly 17 rows, including Cuba Street as CBD night collection", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const [{ n }] = await db("addresses").count({ n: "*" });
    expect(n).toBe(SEEDED_ROW_COUNT);

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

  it("spans all five council zones and 13 distinct suburbs", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const zones = await db("addresses").distinct("zone");
    expect(zones.map((row) => row.zone).sort()).toEqual([
      "zone-cbd",
      "zone-east",
      "zone-north",
      "zone-south",
      "zone-west",
    ]);

    const suburbs = await db("addresses").distinct("suburb");
    expect(suburbs).toHaveLength(13);
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

    expect(byStreet.get("Marjoribanks Street, Mount Victoria")).toBe(1);
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

  it("rejects when run before the addresses table has been migrated", async () => {
    db = Knex(knexConfigs.test);
    await expect(db.seed.run()).rejects.toThrow(/no such table: addresses/);
  });

  it("running the seed three times in a row leaves exactly 17 rows every time", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (let run = 1; run <= 3; run += 1) {
      await db.seed.run();
      const [{ n }] = await db("addresses").count({ n: "*" });
      expect({ run, n }).toEqual({ run, n: SEEDED_ROW_COUNT });
    }
  });

  it("re-seeding deliberately wipes rows added since the last run (ADR 0012)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    await db("addresses").insert({
      street_name: "Test Street",
      suburb: "Test Suburb",
      zone: "zone-test",
    });
    const [{ n: beforeReseed }] = await db("addresses").count({ n: "*" });
    expect(beforeReseed).toBe(SEEDED_ROW_COUNT + 1);

    await db.seed.run();

    const [{ n }] = await db("addresses").count({ n: "*" });
    expect(n).toBe(SEEDED_ROW_COUNT);
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
