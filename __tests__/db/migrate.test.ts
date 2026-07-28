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
