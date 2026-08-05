// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as searchRoute from "@/app/api/sorting/search/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(searchRoute);

/**
 * Isolated in its own file: it breaks the shared connection, which would
 * poison sibling tests — mirrors __tests__/api/suburbs-search-failure.test.ts.
 */
describe("GET /api/sorting/search with a broken database connection", () => {
  beforeAll(async () => {
    await setupTestDb();
    await getDb()("sorting_rules").insert([
      {
        item_key: "coffee-cup",
        description_en: "A disposable takeaway coffee cup.",
        description_mi: "He kapu kawhe kotahi noa te whakamahi.",
        disposal_instructions_en: "Put the whole cup in general rubbish.",
        disposal_instructions_mi: "Whakauruhia te kapu katoa ki te para whānui.",
      },
    ]);
    await getDb().destroy();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("reports 503 with the error envelope instead of throwing, and logs the real error server-side (#142)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("coffee")}`,
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to search sorting rules." });
    expect(errorSpy).toHaveBeenCalledWith(
      "[api/sorting/search] Query failed:",
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  it("keeps reporting the same failure on a subsequent request", async () => {
    const response = await request(app).get(
      `/api/sorting/search?q=${encodeURIComponent("coffee")}`,
    );
    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Unable to search sorting rules." });
  });
});
