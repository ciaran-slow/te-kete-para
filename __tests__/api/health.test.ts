// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import * as healthRoute from "@/app/api/health/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(healthRoute);

describe("GET /api/health", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("reports ok after querying the migrated database", async () => {
    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["content-type"]).toMatch(/application\/json/);
  });

  it("answers repeated requests without exhausting the single connection", async () => {
    // The sqlite3 pool is { min: 1, max: 1 }: a handler or adapter that leaks
    // the one connection hangs or fails on the second request, not the first.
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(app).get("/api/health");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok" });
    }
  });

  it("rejects a verb the route does not export with 405 and an Allow header", async () => {
    const response = await request(app).post("/api/health");

    expect(response.status).toBe(405);
    expect(response.headers["allow"]).toBe("GET");
  });
});
