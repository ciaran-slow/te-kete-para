// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as subscribeRoute from "@/app/api/notifications/subscribe/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(subscribeRoute);
const ROUTE = "/api/notifications/subscribe";

const VALID_BODY = {
  endpoint: "https://push.example/broken-connection",
  keys: { p256dh: "key", auth: "secret" },
};

/**
 * Isolated in its own file: it breaks the shared connection, which would
 * poison sibling tests — mirrors __tests__/api/holidays-failure.test.ts.
 */
describe("POST/DELETE /api/notifications/subscribe with a broken database connection", () => {
  beforeAll(async () => {
    await setupTestDb();
    // Destroy the connection but leave the singleton in place, so the route
    // still reaches for the same (now unusable) instance.
    await getDb().destroy();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("POST reports 503 with the error envelope instead of throwing", async () => {
    const response = await request(app).post(ROUTE).send(VALID_BODY);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to store push subscription." });
  });

  it("POST keeps reporting the same failure on a subsequent request", async () => {
    const response = await request(app).post(ROUTE).send(VALID_BODY);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to store push subscription." });
  });

  it("DELETE reports 503 with the error envelope instead of throwing", async () => {
    const response = await request(app)
      .delete(ROUTE)
      .send({ endpoint: VALID_BODY.endpoint });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to remove push subscription." });
  });

  it("DELETE keeps reporting the same failure on a subsequent request", async () => {
    const response = await request(app)
      .delete(ROUTE)
      .send({ endpoint: VALID_BODY.endpoint });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to remove push subscription." });
  });
});
