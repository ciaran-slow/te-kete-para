// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as holidaysRoute from "@/app/api/holidays/route";
import { toHolidayApiRecord } from "@/app/api/holidays/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(holidaysRoute);

describe("GET /api/holidays", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // Runs before the fixture insert below: the freshly-migrated (not seeded)
  // test DB has no holidays rows yet.
  it("returns an empty results array when the table has no rows", async () => {
    const response = await request(app).get("/api/holidays");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ results: [] });
  });

  describe("with fixture rows", () => {
    beforeAll(async () => {
      // Deliberately inserted in NON-chronological order: sqlite's default
      // rowid order then differs from ORDER BY holiday_date, so the ordering
      // assertions below actually fail if the route drops its
      // .orderBy("holiday_date", "asc") clause (same technique as
      // __tests__/api/suburbs-search.test.ts).
      await getDb()("holidays").insert([
        { holiday_date: "2026-12-25", name_en: "Christmas Day", name_mi: "Te Rā Kirihimete", shift_days: 1 },
        { holiday_date: "2026-01-01", name_en: "New Year's Day", name_mi: "Te Rā Tau Hou", shift_days: 1 },
        { holiday_date: "2026-04-03", name_en: "Good Friday", name_mi: "Te Rāmere Pai", shift_days: 1 },
      ]);
    });

    it("returns all rows with camelCase fields, ordered by ascending date", async () => {
      const response = await request(app).get("/api/holidays");

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        results: [
          { date: "2026-01-01", nameEn: "New Year's Day", nameMi: "Te Rā Tau Hou", shiftDays: 1 },
          { date: "2026-04-03", nameEn: "Good Friday", nameMi: "Te Rāmere Pai", shiftDays: 1 },
          { date: "2026-12-25", nameEn: "Christmas Day", nameMi: "Te Rā Kirihimete", shiftDays: 1 },
        ],
      });
    });

    it("returns each record with the exact shape and a numeric shiftDays", async () => {
      const response = await request(app).get("/api/holidays");

      expect(response.status).toBe(200);
      for (const record of response.body.results) {
        expect(Object.keys(record).sort()).toEqual([
          "date",
          "nameEn",
          "nameMi",
          "shiftDays",
        ]);
        // The JSON *type* matters: a driver handing back "1" (string) would
        // satisfy a loose comparison — assert the mapped value is a number.
        expect(typeof record.shiftDays).toBe("number");
      }
    });

    it("answers repeated identical requests with identical results", async () => {
      // The sqlite3 pool is { min: 1, max: 1 }: a handler that leaks the one
      // connection, or a read path with side effects, drifts on later calls.
      const expected = [
        { date: "2026-01-01", nameEn: "New Year's Day", nameMi: "Te Rā Tau Hou", shiftDays: 1 },
        { date: "2026-04-03", nameEn: "Good Friday", nameMi: "Te Rāmere Pai", shiftDays: 1 },
        { date: "2026-12-25", nameEn: "Christmas Day", nameMi: "Te Rā Kirihimete", shiftDays: 1 },
      ];
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await request(app).get("/api/holidays");

        expect(response.status).toBe(200);
        expect(response.body.results).toEqual(expected);
      }
    });

    it("rejects a verb the route does not export with 405 and an Allow header", async () => {
      const response = await request(app).post("/api/holidays");

      expect(response.status).toBe(405);
      expect(response.headers["allow"]).toBe("GET");
    });

    it("toHolidayApiRecord maps a raw snake_case row to the camelCase shape exactly", () => {
      expect(
        toHolidayApiRecord({
          holiday_date: "2026-06-22",
          name_en: "Matariki",
          name_mi: "Matariki",
          shift_days: 2,
        }),
      ).toEqual({
        date: "2026-06-22",
        nameEn: "Matariki",
        nameMi: "Matariki",
        shiftDays: 2,
      });
    });
  });
});
