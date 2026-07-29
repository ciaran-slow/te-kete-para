import { createRequire } from "node:module";
import path from "node:path";
import Knex from "knex";
import type { Knex as KnexTypes } from "knex";

type KnexInstance = ReturnType<typeof Knex>;

let db: KnexInstance | undefined;

/**
 * Loads knexfile.js at runtime instead of importing it statically. knexfile.js is
 * CommonJS that resolves the data/ directory and the migrations/seeds paths from
 * `__dirname`; bundling it into a route handler rewrites `__dirname` to a `/ROOT`
 * placeholder, so its load-time `mkdirSync` fails the `next build` page-data pass and
 * every path it hands Knex would be wrong at runtime. A require of a path built at
 * call time is opaque to the bundler, so the Knex CLI, Vitest and route handlers all
 * read the same real file (ADR 0002).
 */
function loadKnexConfigs(): Record<string, KnexTypes.Config> {
  const knexfilePath = path.join(process.cwd(), "knexfile.js");
  return createRequire(knexfilePath)(knexfilePath) as Record<
    string,
    KnexTypes.Config
  >;
}

/**
 * Lazily-created shared Knex instance. Config always comes from knexfile.js so the
 * per-connection `PRAGMA foreign_keys = ON` hook rides along (architecture.md §2C).
 */
export function getDb(): KnexInstance {
  db ??= Knex(
    loadKnexConfigs()[process.env.NODE_ENV === "test" ? "test" : "development"],
  );
  return db;
}

/** Destroys the shared instance and clears the singleton. Safe to call twice. */
export async function destroyDb(): Promise<void> {
  const instance = db;
  db = undefined;
  await instance?.destroy();
}
