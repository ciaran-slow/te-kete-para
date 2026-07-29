import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* knex is not on this fork's auto-external list and resolves its dialects
     with dynamic requires, which break once bundled into a route handler.
     sqlite3 is already auto-external, so it needs no entry (ADR 0002). */
  serverExternalPackages: ["knex"],
};

export default nextConfig;
