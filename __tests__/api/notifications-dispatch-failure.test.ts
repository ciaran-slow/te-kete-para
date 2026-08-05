// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as dispatchRoute from "@/app/api/notifications/dispatch/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(dispatchRoute);

/**
 * Isolated in its own file: it breaks the shared connection, which would
 * poison sibling tests — mirrors __tests__/api/health-failure.test.ts and
 * __tests__/api/holidays-failure.test.ts.
 */
describe("GET /api/notifications/dispatch with a broken database connection", () => {
  beforeAll(async () => {
    await setupTestDb();
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    // Destroy the connection but leave the singleton in place, so the route
    // still reaches for the same (now unusable) instance.
    await getDb().destroy();
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await teardownTestDb();
  });

  it("reports 503 instead of throwing", async () => {
    // ~1.5s of latency here comes from withRetry's real backoff (ADR 0061,
    // 3 attempts against the broken connection) -- not a regression.
    const response = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", "Bearer test-cron-secret");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Nightly dispatch run failed." });
  });

  it("keeps reporting the same failure on a subsequent request", async () => {
    const response = await request(app)
      .get("/api/notifications/dispatch")
      .set("Authorization", "Bearer test-cron-secret");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Nightly dispatch run failed." });
  });
});
