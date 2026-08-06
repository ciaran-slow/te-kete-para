import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../knexfile.js";

/**
 * The migration filenames on disk, read from the same directory the test
 * config points Knex at. Derived rather than hard-coded so adding a migration
 * doesn't require editing an assertion in this unrelated file.
 */
function migrationFilenames(): string[] {
  const directory = knexConfigs.test.migrations?.directory;
  if (typeof directory !== "string") {
    throw new Error(
      "knexfile test config must define migrations.directory as a string",
    );
  }
  // Knex's default loadExtensions is wider than this (.cjs, .ts, .coffee, …),
  // but this repo's migrations are CommonJS .js only — the Knex CLI loads them
  // directly and there is no ts-node (see knexfile.js). A migration added with
  // another supported extension would be run and recorded by Knex but missed
  // here, failing this test rather than passing silently. Widen the filter if
  // that convention ever changes.
  return fs
    .readdirSync(directory)
    .filter((filename) => filename.endsWith(".js"))
    .sort();
}

function hasUniquePrefixes(filenames: string[]): boolean {
  const prefixes = filenames.map((f) => f.slice(0, 14));
  return new Set(prefixes).size === prefixes.length;
}

const FILENAME_CONVENTION = /^\d{14}_[a-z0-9_]+\.js$/;

describe("knex migration pipeline", () => {
  let db: ReturnType<typeof Knex> | undefined;

  afterEach(async () => {
    await db?.destroy();
    db = undefined;
  });

  it("runs the baseline migration against an in-memory database", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    expect(await db.schema.hasTable("_baseline_check")).toBe(true);
  });

  it("tracks migrations in knex_migrations and is idempotent on repeat runs", async () => {
    db = Knex(knexConfigs.test);
    const [batch1] = await db.migrate.latest();
    const [batch2, log2] = await db.migrate.latest();
    expect(batch1).toBe(1);
    // second run is a no-op: same batch number reported, nothing re-applied
    expect(batch2).toBe(1);
    expect(log2).toEqual([]);
    // Every migration file on disk is recorded exactly once, by name — a
    // stronger check than a count, and it needs no edit when migrations are
    // added.
    const migrationRows = await db("knex_migrations").select("name");
    expect(migrationRows.map((row) => row.name).sort()).toEqual(
      migrationFilenames(),
    );
  });

  it("rolls back and can re-migrate cleanly (up -> down -> up)", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await db.migrate.rollback();
    expect(await db.schema.hasTable("_baseline_check")).toBe(false);
    await db.migrate.latest();
    expect(await db.schema.hasTable("_baseline_check")).toBe(true);
  });

  it("rolling back with nothing migrated is a safe no-op, not an error", async () => {
    db = Knex(knexConfigs.test);
    const [batch, log] = await db.migrate.rollback();
    expect(batch).toBe(0);
    expect(log).toEqual([]);
  });

  it("running seed:run with no seed files resolves without error", async () => {
    db = Knex(knexConfigs.test);
    await db.migrate.latest();
    await expect(db.seed.run()).resolves.toBeDefined();
  });
});

describe("migration filename conventions", () => {
  it("has no two migration files sharing a 14-digit timestamp prefix", () => {
    expect(hasUniquePrefixes(migrationFilenames())).toBe(true);
  });

  it("every migration filename matches <14-digit timestamp>_<snake_case>.js", () => {
    for (const filename of migrationFilenames()) {
      expect(filename).toMatch(FILENAME_CONVENTION);
    }
  });

  // Proves the check above is not vacuous: it must actually go red on the
  // exact collision #149 fixed (two files both prefixed 20260803120000),
  // and green once one of them is retimestamped.
  it("detects a duplicate timestamp prefix", () => {
    expect(
      hasUniquePrefixes([
        "20260803120000_add_keywords_to_sorting_rules.js",
        "20260803120000_widen_push_subscriptions_endpoint_to_text.js",
      ]),
    ).toBe(false);
    expect(
      hasUniquePrefixes([
        "20260803120000_add_keywords_to_sorting_rules.js",
        "20260803120001_widen_push_subscriptions_endpoint_to_text.js",
      ]),
    ).toBe(true);
  });

  // Proves the convention regex actually rejects malformed shapes, not just
  // accepts today's real filenames.
  it("rejects filenames that don't match the convention", () => {
    const malformed = [
      "2026080312000_a.js", // 13-digit prefix
      "202608031200000_a.js", // 15-digit prefix
      "20260803120000-a.js", // hyphen instead of underscore
      "20260803120000_A.js", // uppercase in the name segment
      "20260803120000_a.ts", // wrong extension
      "20260803120000_.js", // empty name segment
    ];
    for (const filename of malformed) {
      expect(filename).not.toMatch(FILENAME_CONVENTION);
    }
    expect("20260803120000_add_keywords_to_sorting_rules.js").toMatch(
      FILENAME_CONVENTION,
    );
  });
});
