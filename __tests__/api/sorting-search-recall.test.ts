// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as searchRoute from "@/app/api/sorting/search/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(searchRoute);

/**
 * Locks in real-seed recall for the three queries issue #73's probe found
 * broken (db/seeds/02_sorting_rules.js) — distinct from the hand-rolled
 * fixtures in sorting-search.test.ts, this file seeds the actual production
 * dataset so a regression in the seed content or the match logic fails here.
 */
describe("GET /api/sorting/search recall against the real seed (issue #73)", () => {
  beforeAll(async () => {
    await setupTestDb();
    await getDb().seed.run();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("returns household-batteries for the singular query 'battery'", async () => {
    const response = await request(app).get("/api/sorting/search?q=battery");
    expect(response.status).toBe(200);
    expect(
      response.body.results.map((r: { itemKey: string }) => r.itemKey),
    ).toEqual(["household-batteries"]);
  });

  it("returns soft-plastic-bag for the two-word query 'plastic bag'", async () => {
    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("plastic bag")}`,
    );
    expect(response.status).toBe(200);
    expect(
      response.body.results.map((r: { itemKey: string }) => r.itemKey),
    ).toEqual(["soft-plastic-bag"]);
  });

  it("returns small-e-waste for the hyphen-free query 'ewaste'", async () => {
    const response = await request(app).get("/api/sorting/search?q=ewaste");
    expect(response.status).toBe(200);
    expect(
      response.body.results.map((r: { itemKey: string }) => r.itemKey),
    ).toEqual(["small-e-waste"]);
  });

  it("answers the same 'battery' query identically on three repeated requests", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(app).get("/api/sorting/search?q=battery");
      expect(response.status).toBe(200);
      expect(
        response.body.results.map((r: { itemKey: string }) => r.itemKey),
      ).toEqual(["household-batteries"]);
    }
  });

  it("does not widen 'battery bag' into an OR match across rows (AND-per-term)", async () => {
    // "battery" only matches household-batteries (via keywords) and "bag"
    // only matches soft-plastic-bag (via description_en) — no seeded row
    // has both, so a correct AND-per-term implementation returns nothing.
    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("battery bag")}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
  });
});
