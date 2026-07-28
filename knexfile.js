/* eslint-disable @typescript-eslint/no-require-imports --
   This file is CommonJS on purpose: the Knex CLI loads it directly with
   `require`, outside the Next.js bundler, and the repo has no ts-node/tsx. */
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

/* SQLite starts every connection with `PRAGMA foreign_keys = OFF`, which makes
   the references()/onDelete() clauses in our migrations inert: orphan
   address_id values insert silently and SET NULL never fires on delete. The
   pragma is per-connection, so it has to be re-applied in afterCreate. This
   does NOT resize the sqlite3 dialect's default `{ min: 1, max: 1 }` pool,
   which architecture.md §2C requires we leave alone. */
const pool = {
  afterCreate: (conn, done) => conn.run("PRAGMA foreign_keys = ON", done),
};

/** @type {Record<string, import('knex').Knex.Config>} */
module.exports = {
  development: {
    client: "sqlite3",
    connection: { filename: path.join(dataDir, "teketepara.db") },
    useNullAsDefault: true,
    pool,
    migrations: { directory: path.join(__dirname, "db", "migrations") },
    seeds: { directory: path.join(__dirname, "db", "seeds") },
  },
  test: {
    client: "sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
    pool,
    migrations: { directory: path.join(__dirname, "db", "migrations") },
    seeds: { directory: path.join(__dirname, "db", "seeds") },
  },
};
