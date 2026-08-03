// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as holidaysRoute from "@/app/api/holidays/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(holidaysRoute);

/**
 * Isolated in its own file: it breaks the shared connection, which would
 * poison sibling tests — mirrors __tests__/api/suburbs-search-failure.test.ts.
 */
describe("GET /api/holidays with a broken database connection", () => {
  beforeAll(async () => {
    await setupTestDb();
    await getDb()("holidays").insert([
      { holiday_date: "2026-12-25", name_en: "Christmas Day", name_mi: "Te Rā Kirihimete", shift_days: 1 },
    ]);
    // Destroy the connection but leave the singleton in place, so the route
    // still reaches for the same (now unusable) instance.
    await getDb().destroy();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("reports 503 with the error envelope instead of throwing", async () => {
    const response = await request(app).get("/api/holidays");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to load public holidays." });
  });

  it("keeps reporting the same failure on a subsequent request", async () => {
    const response = await request(app).get("/api/holidays");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to load public holidays." });
  });
});
