// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as searchRoute from "@/app/api/sorting/search/route";
import {
  toSortingRuleSearchResult,
} from "@/app/api/sorting/search/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(searchRoute);

const MISSING_QUERY_BODY = { error: "Query parameter q is required." };

describe("GET /api/sorting/search", () => {
  beforeAll(async () => {
    await setupTestDb();
    // Inserted out of item_key alphabetical order (tin-can, coffee-cup,
    // aerosol-can) so ORDER BY item_key actually gets exercised.
    await getDb()("sorting_rules").insert([
      {
        item_key: "tin-can",
        description_en: "A steel tin can for food.",
        description_mi: "He kēne rino mō te kai.",
        disposal_instructions_en: "Rinse and put it in mixed recycling.",
        disposal_instructions_mi: "Horoia, whakauruhia ki te rauemi hangarua.",
      },
      {
        item_key: "coffee-cup",
        description_en: "A disposable takeaway coffee cup.",
        description_mi: "He kapu kawhe kotahi noa te whakamahi.",
        disposal_instructions_en: "Put the whole cup in general rubbish.",
        disposal_instructions_mi: "Whakauruhia te kapu katoa ki te para whānui.",
      },
      {
        item_key: "aerosol-can",
        description_en: "An aerosol can, such as deodorant or spray paint.",
        description_mi: "He kēne rehu matūriki, hei tauira te wai kakara.",
        disposal_instructions_en: "Empty cans go in general rubbish.",
        disposal_instructions_mi: "Ka haere ngā kēne watea ki te para whānui.",
      },
    ]);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("returns the exact match with camelCase, bilingual fields", async () => {
    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("disposable takeaway coffee cup")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([
      {
        itemKey: "coffee-cup",
        descriptionEn: "A disposable takeaway coffee cup.",
        descriptionMi: "He kapu kawhe kotahi noa te whakamahi.",
        disposalInstructionsEn: "Put the whole cup in general rubbish.",
        disposalInstructionsMi: "Whakauruhia te kapu katoa ki te para whānui.",
      },
    ]);
  });

  it("matches partial, case-insensitive keywords across rows, ordered by item_key", async () => {
    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("CAN")}`,
    );

    expect(response.status).toBe(200);
    expect(
      response.body.results.map((r: { itemKey: string }) => r.itemKey),
    ).toEqual(["aerosol-can", "tin-can"]);
  });

  it("matches a Te Reo Māori keyword in description_mi", async () => {
    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("kēne")}`,
    );

    expect(response.status).toBe(200);
    expect(
      response.body.results.map((r: { itemKey: string }) => r.itemKey).sort(),
    ).toEqual(["aerosol-can", "tin-can"]);
  });

  it("returns an empty result set for no match, not an error", async () => {
    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("nonexistent-item-zzz")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
  });

  it("does not match a keyword that only appears in disposal_instructions", async () => {
    // "recycling" only appears in tin-can's disposal_instructions_en, not
    // in any description or item_key — proves instructions are excluded
    // from the match scope (ADR 0025).
    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("recycling")}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
  });

  it("rejects an empty query value with 400", async () => {
    const response = await request(app).get("/api/sorting/search?q=");
    expect(response.status).toBe(400);
    expect(response.body).toEqual(MISSING_QUERY_BODY);
  });

  it("rejects a request with no q parameter at all with 400", async () => {
    const response = await request(app).get("/api/sorting/search");
    expect(response.status).toBe(400);
    expect(response.body).toEqual(MISSING_QUERY_BODY);
  });

  it("rejects a whitespace-only query with 400", async () => {
    const response = await request(app).get("/api/sorting/search?q=%20%20%20");
    expect(response.status).toBe(400);
    expect(response.body).toEqual(MISSING_QUERY_BODY);
  });

  it("treats a literal % as a character to match, not a wildcard", async () => {
    const response = await request(app).get("/api/sorting/search?q=%25");
    expect(response.status).toBe(200);
    expect(response.body.results).toEqual([]);
  });

  it("answers repeated identical requests with identical results", async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await request(app).get(
        `/api/sorting/search?q=${encodeURIComponent("can")}`,
      );
      expect(response.status).toBe(200);
      expect(
        response.body.results.map((r: { itemKey: string }) => r.itemKey),
      ).toEqual(["aerosol-can", "tin-can"]);
    }
  });

  it("rejects a verb the route does not export with 405 and an Allow header", async () => {
    const response = await request(app).post("/api/sorting/search");
    expect(response.status).toBe(405);
    expect(response.headers["allow"]).toBe("GET");
  });

  it("toSortingRuleSearchResult maps snake_case rows to camelCase", () => {
    const mapped = toSortingRuleSearchResult({
      item_key: "test-item",
      description_en: "en desc",
      description_mi: "mi desc",
      disposal_instructions_en: "en instr",
      disposal_instructions_mi: "mi instr",
    });
    expect(mapped).toEqual({
      itemKey: "test-item",
      descriptionEn: "en desc",
      descriptionMi: "mi desc",
      disposalInstructionsEn: "en instr",
      disposalInstructionsMi: "mi instr",
    });
  });
});
