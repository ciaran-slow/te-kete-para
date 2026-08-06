import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../../knexfile.js";

/**
 * db/seeds/02_sorting_rules.js: the fixed 15-row bilingual item lookup —
 * common household items with English and Te Reo Māori descriptions and
 * WCC disposal instructions (issue #19). Idempotency is delete-then-reinsert
 * (ADR 0012), which these tests pin down as deliberate behaviour: repeated
 * runs and destructive re-seed are asserted, not just documented. Unlike
 * addresses, no other table has a foreign key into sorting_rules, so there
 * is no FK-nulling side effect to assert here.
 */
const SEEDED_ROW_COUNT = 15;

// The full item_key set, sorted. Pinning every key (not just a count) means a
// renamed or misspelled key fails loudly, and it pins the lowercase kebab-case
// slug convention that #20 will put in a URL/query parameter.
const SEEDED_ITEM_KEYS = [
  "aerosol-can",
  "coffee-cup",
  "food-scraps",
  "glass-bottle",
  "household-batteries",
  "light-bulb",
  "milk-carton",
  "paint-tin",
  "pizza-box",
  "plastic-bottle",
  "polystyrene-packaging",
  "small-e-waste",
  "soft-plastic-bag",
  "textiles-clothing",
  "tin-can",
];

describe("sorting_rules seed", () => {
  let db: ReturnType<typeof Knex> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("seeds exactly 15 rows, including pizza box, coffee cup, and aerosol can (issue #19 acceptance criteria)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const [{ n }] = await db("sorting_rules").count({ n: "*" });
    expect(n).toBe(SEEDED_ROW_COUNT);

    // The exact key set, not just the three named items: a broken or renamed
    // item_key on any of the 15 rows fails here, and the sorted comparison
    // gives a readable diff naming the offending key.
    const keys = await db("sorting_rules").pluck("item_key");
    expect([...keys].sort()).toEqual(SEEDED_ITEM_KEYS);
    for (const named of ["pizza-box", "coffee-cup", "aerosol-can"]) {
      expect(SEEDED_ITEM_KEYS).toContain(named);
    }
  });

  it("every row has non-empty, distinct English and Te Reo Māori text", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const rows = await db("sorting_rules").select(
      "item_key",
      "description_en",
      "description_mi",
      "disposal_instructions_en",
      "disposal_instructions_mi",
    );
    expect(rows).toHaveLength(SEEDED_ROW_COUNT);
    for (const row of rows) {
      // Non-empty on all 15 rows, not just the three items issue #19 names:
      // an empty translation on any row is a delivery failure for the
      // bilingual lookup this table exists to provide.
      expect(row.description_en.length).toBeGreaterThan(0);
      expect(row.description_mi.length).toBeGreaterThan(0);
      expect(row.disposal_instructions_en.length).toBeGreaterThan(0);
      expect(row.disposal_instructions_mi.length).toBeGreaterThan(0);
      // Distinctness guards against the mi column being a copy of en. With
      // the non-empty assertions above, "" no longer passes trivially.
      expect(row.description_en).not.toBe(row.description_mi);
      expect(row.disposal_instructions_en).not.toBe(
        row.disposal_instructions_mi,
      );
    }
  });

  it("represents kerbside-recyclable, hazardous-drop-off-only, and general-rubbish-only disposal pathways", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const glassBottle = await db("sorting_rules")
      .where({ item_key: "glass-bottle" })
      .first("disposal_instructions_en");
    if (!glassBottle) throw new Error("seed did not insert glass-bottle");
    expect(glassBottle.disposal_instructions_en).toContain(
      "glass recycling crate",
    );

    const batteries = await db("sorting_rules")
      .where({ item_key: "household-batteries" })
      .first("disposal_instructions_en");
    if (!batteries) throw new Error("seed did not insert household-batteries");
    expect(batteries.disposal_instructions_en).toContain("Never put");
    expect(batteries.disposal_instructions_en).toContain("transfer station");

    const coffeeCup = await db("sorting_rules")
      .where({ item_key: "coffee-cup" })
      .first("disposal_instructions_en");
    if (!coffeeCup) throw new Error("seed did not insert coffee-cup");
    expect(coffeeCup.disposal_instructions_en).toContain("yellow rubbish bag");
  });

  it("corrects the pizza-box grease myth, the polystyrene drop-off hedge, and the light-bulb overclaim (issue #70 live WCC confirmation)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const pizzaBox = await db("sorting_rules")
      .where({ item_key: "pizza-box" })
      .first("disposal_instructions_en");
    if (!pizzaBox) throw new Error("seed did not insert pizza-box");
    // WCC's own "Recycling myths – busted!" says grease stains alone are
    // fine; a box only needs food/cheese residue scraped off. The old text
    // said a greasy box must go to general rubbish -- if that wrong claim
    // were reinstated, "grease stains" wouldn't appear and "general
    // rubbish" would, so this assertion is falsifiable in both directions.
    expect(pizzaBox.disposal_instructions_en).toContain("grease stains");
    expect(pizzaBox.disposal_instructions_en).not.toContain(
      "general rubbish",
    );

    const polystyrene = await db("sorting_rules")
      .where({ item_key: "polystyrene-packaging" })
      .first("disposal_instructions_en");
    if (!polystyrene) {
      throw new Error("seed did not insert polystyrene-packaging");
    }
    // WCC's "Types of waste accepted" confirms Southern Landfill takes
    // polystyrene outright; the old text only hedged ("check whether").
    expect(polystyrene.disposal_instructions_en).toContain(
      "Southern Landfill",
    );
    expect(polystyrene.disposal_instructions_en).not.toContain(
      "check whether",
    );

    const lightBulb = await db("sorting_rules")
      .where({ item_key: "light-bulb" })
      .first("disposal_instructions_en");
    if (!lightBulb) throw new Error("seed did not insert light-bulb");
    // WCC's hazardous-waste accepted list only names CFL/fluorescent bulbs
    // (mercury) -- the old text said "all bulb types" need hazardous
    // handling, which no WCC page supports for LED/incandescent.
    expect(lightBulb.disposal_instructions_en).toContain("LED");
    expect(lightBulb.disposal_instructions_en).toContain("yellow rubbish bag");
    expect(lightBulb.disposal_instructions_en).not.toContain(
      "all bulb types",
    );
  });

  it("corrects the aerosol-can empty-vs-full disposal split (issue #119 live WCC confirmation)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const aerosolCan = await db("sorting_rules")
      .where({ item_key: "aerosol-can" })
      .first("disposal_instructions_en", "disposal_instructions_mi");
    if (!aerosolCan) throw new Error("seed did not insert aerosol-can");
    // WCC's own "What to do with your waste" lookup tool says aerosol/spray
    // cans go straight to kerbside general rubbish regardless of fill state
    // -- the old text invented an empty-vs-full split sending every full can
    // to hazardous waste at a transfer station instead. If that wrong split
    // were reinstated, "yellow rubbish bag" wouldn't cover the full-can case
    // and "completely empty"/"still contains product" would reappear, so
    // this assertion is falsifiable in both directions. ("Yellow rubbish
    // bag" replaced the old wording's bare "general rubbish" per ADR 0069 --
    // same disposal pathway, now named consistently with the rest of the app.)
    expect(aerosolCan.disposal_instructions_en).toContain("yellow rubbish bag");
    expect(aerosolCan.disposal_instructions_en).not.toContain(
      "completely empty",
    );
    expect(aerosolCan.disposal_instructions_en).not.toContain(
      "still contains product",
    );
    // A plain aerosol/spray can isn't the only thing this row's own
    // description names -- "spray paint" is too, and WCC's separate Paint
    // guidance treats paint as hazardous waste regardless of container
    // (verify finding, PR #137). The general-rubbish answer above must not
    // silently swallow that case: assert the row carves spray paint out to
    // hazardous-waste handling explicitly, which the pre-fix text did not.
    expect(aerosolCan.disposal_instructions_en).toContain("spray paint");
    expect(aerosolCan.disposal_instructions_en).toContain("hazardous waste");

    // The Te Reo Māori column serves Te Reo readers directly and has its
    // own history of content regressions (PR #88 -> #70 -> #119) that the
    // English-only assertions above cannot catch -- e.g. reverting only
    // `disposal_instructions_mi` to the old wrong split leaves every
    // English assertion above green. Pin the same two claims in mi: "pēke
    // kōwhai para" (yellow rubbish bag, ADR 0069 -- was "para whānui") for
    // the general case, "para mōrearea" (hazardous waste) for the
    // spray-paint carve-out, and reject the old wrong phrasing for
    // "completely empty" ("kua tino watea") and "still contains product"
    // ("kei roto tonu").
    expect(aerosolCan.disposal_instructions_mi).toContain("pēke kōwhai para");
    expect(aerosolCan.disposal_instructions_mi).toContain("para mōrearea");
    expect(aerosolCan.disposal_instructions_mi).not.toContain(
      "kua tino watea",
    );
    expect(aerosolCan.disposal_instructions_mi).not.toContain(
      "kei roto tonu",
    );
  });

  it("seeds a 'battery' keyword on household-batteries to fix issue #73's search-recall gap", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    const batteries = await db("sorting_rules")
      .where({ item_key: "household-batteries" })
      .first("keywords");
    if (!batteries) throw new Error("seed did not insert household-batteries");
    expect(batteries.keywords).toBe("battery");
  });

  it("rejects when run before the sorting_rules table has been migrated", async () => {
    db = Knex(knexConfigs.test);
    // `specific` targets this seed file: a plain seed.run() against an
    // unmigrated database rejects on 01_addresses.js ("no such table:
    // addresses") before the sorting_rules seed ever executes.
    await expect(
      db.seed.run({ specific: "02_sorting_rules.js" }),
    ).rejects.toThrow(/no such table: sorting_rules/);
  });

  it("running the seed three times in a row leaves exactly 15 rows every time", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();

    for (let run = 1; run <= 3; run += 1) {
      await db.seed.run();
      const [{ n }] = await db("sorting_rules").count({ n: "*" });
      expect({ run, n }).toEqual({ run, n: SEEDED_ROW_COUNT });
    }
  });

  it("re-seeding wipes rows added since the last run", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.seed.run();

    await db("sorting_rules").insert({
      item_key: "test-item",
      description_en: "A test-only item.",
      description_mi: "He taonga whakamātau anake.",
      disposal_instructions_en: "Test disposal instructions.",
      disposal_instructions_mi: "He tohutohu whakamātau.",
    });
    const [{ n: beforeReseed }] = await db("sorting_rules").count({ n: "*" });
    expect(beforeReseed).toBe(SEEDED_ROW_COUNT + 1);

    await db.seed.run();

    const [{ n }] = await db("sorting_rules").count({ n: "*" });
    expect(n).toBe(SEEDED_ROW_COUNT);
    expect(
      await db("sorting_rules").where({ item_key: "test-item" }),
    ).toEqual([]);
  });
});
