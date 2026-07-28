import { afterEach, describe, expect, it } from "vitest";
import Knex from "knex";
import knexConfigs from "../../knexfile.js";

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
    const migrationRows = await db("knex_migrations").select("name");
    // one row per migration file in db/migrations — bump when adding migrations
    expect(migrationRows).toHaveLength(7);
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
