// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as healthRoute from "@/app/api/health/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(healthRoute);

/**
 * Isolated in its own file: it breaks the shared connection, which would poison
 * sibling tests — and a passing suite here re-proves each file gets a fresh DB.
 */
describe("GET /api/health with a broken database connection", () => {
  beforeAll(async () => {
    await setupTestDb();
    // Destroy the connection but leave the singleton in place, so the route
    // still reaches for the same (now unusable) instance.
    await getDb().destroy();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("reports 503 unavailable instead of throwing", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });
  });

  it("keeps reporting the failure on subsequent requests", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: "unavailable" });
  });
});
