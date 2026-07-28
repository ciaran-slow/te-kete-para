/* eslint-disable @typescript-eslint/no-require-imports --
   This file is CommonJS on purpose: the Knex CLI loads it directly with
   `require`, outside the Next.js bundler, and the repo has no ts-node/tsx. */
const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

/** @type {Record<string, import('knex').Knex.Config>} */
module.exports = {
  development: {
    client: "sqlite3",
    connection: { filename: path.join(dataDir, "teketepara.db") },
    useNullAsDefault: true,
    migrations: { directory: path.join(__dirname, "db", "migrations") },
    seeds: { directory: path.join(__dirname, "db", "seeds") },
  },
  test: {
    client: "sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
    migrations: { directory: path.join(__dirname, "db", "migrations") },
    seeds: { directory: path.join(__dirname, "db", "seeds") },
  },
};
