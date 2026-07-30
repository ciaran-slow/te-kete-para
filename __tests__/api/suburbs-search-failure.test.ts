// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as searchRoute from "@/app/api/suburbs/search/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(searchRoute);

/**
 * Isolated in its own file: it breaks the shared connection, which would poison
 * sibling tests — same rationale as __tests__/api/health-failure.test.ts.
 */
describe("GET /api/suburbs/search with a broken database connection", () => {
  beforeAll(async () => {
    await setupTestDb();
    await getDb()("addresses").insert([
      { street_name: "Cuba Mall", suburb: "Te Aro", zone: "CBD-INNER", is_inner_city_night_collection: true },
      { street_name: "Cuba Street", suburb: "Te Aro", zone: "CBD-INNER", is_inner_city_night_collection: true },
      { street_name: "Karori Road", suburb: "Karori", zone: "SUBURBAN-WEST", is_inner_city_night_collection: false },
    ]);
    // Destroy the connection but leave the singleton in place, so the route
    // still reaches for the same (now unusable) instance.
    await getDb().destroy();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("reports 503 with the error envelope instead of throwing", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("Cuba")}`,
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to search addresses." });
  });

  it("keeps reporting the same failure on a subsequent request", async () => {
    const response = await request(app).get(
      `/api/suburbs/search?q=${encodeURIComponent("Cuba")}`,
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to search addresses." });
  });
});
