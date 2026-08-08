// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import * as onboardingTimeRoute from "@/app/api/metrics/onboarding-time/route";
import { createRequestListener } from "../helpers/api";

const { validateOnboardingTimeBody } = onboardingTimeRoute;

const app = createRequestListener(onboardingTimeRoute);
const ROUTE = "/api/metrics/onboarding-time";

describe("POST /api/metrics/onboarding-time (NFR-04, ADR 0076)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function lastRecorded() {
    // findLast, not find: across repeated posts, the most recent line is
    // what "last" must mean — find would silently return the first-ever
    // logged line for the whole test.
    const call = logSpy.mock.calls.findLast(
      ([line]: unknown[]) =>
        typeof line === "string" &&
        line.includes('"event":"onboarding_time_recorded"'),
    );
    if (!call) throw new Error("onboarding_time_recorded was not logged");
    return JSON.parse(call[0] as string);
  }

  describe("happy path", () => {
    it("returns 204 and logs a structured onboarding_time_recorded line", async () => {
      const response = await request(app).post(ROUTE).send({ durationMs: 4200 });

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});
      expect(lastRecorded()).toEqual({
        event: "onboarding_time_recorded",
        durationMs: 4200,
        timestamp: expect.any(String),
      });
    });

    it("accepts a durationMs of exactly 0", async () => {
      const response = await request(app).post(ROUTE).send({ durationMs: 0 });

      expect(response.status).toBe(204);
      expect(lastRecorded()).toMatchObject({ durationMs: 0 });
    });
  });

  describe("failure paths", () => {
    it("returns 400 when durationMs is missing", async () => {
      const response = await request(app).post(ROUTE).send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "durationMs must be a non-negative finite number.",
      });
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when durationMs is negative", async () => {
      const response = await request(app).post(ROUTE).send({ durationMs: -1 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "durationMs must be a non-negative finite number.",
      });
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when durationMs is not a number", async () => {
      const response = await request(app)
        .post(ROUTE)
        .send({ durationMs: "4200" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "durationMs must be a non-negative finite number.",
      });
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("returns 400 when durationMs is not finite", async () => {
      const response = await request(app)
        .post(ROUTE)
        .send({ durationMs: Infinity });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "durationMs must be a non-negative finite number.",
      });
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("returns 400 for a malformed JSON body instead of throwing", async () => {
      const response = await request(app)
        .post(ROUTE)
        .set("Content-Type", "application/json")
        .send("{not valid json");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Request body must be valid JSON." });
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe("repetition/idempotence", () => {
    it("logs three consecutive posts as three independent samples", async () => {
      for (const durationMs of [1000, 2500, 500]) {
        const response = await request(app).post(ROUTE).send({ durationMs });
        expect(response.status).toBe(204);
        expect(lastRecorded()).toMatchObject({ durationMs });
      }

      const recordedCalls = logSpy.mock.calls.filter(
        ([line]: unknown[]) =>
          typeof line === "string" &&
          line.includes('"event":"onboarding_time_recorded"'),
      );
      expect(recordedCalls).toHaveLength(3);
    });
  });

  describe("method not exported", () => {
    it("returns 405 with an Allow: POST header for GET", async () => {
      const response = await request(app).get(ROUTE);

      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe("POST");
    });
  });
});

describe("validateOnboardingTimeBody", () => {
  it("accepts a non-negative finite durationMs", () => {
    expect(validateOnboardingTimeBody({ durationMs: 12.5 })).toEqual({
      ok: true,
      value: { durationMs: 12.5 },
    });
  });

  it("rejects a non-record body", () => {
    expect(validateOnboardingTimeBody(null)).toEqual({
      ok: false,
      error: "durationMs must be a non-negative finite number.",
    });
    expect(validateOnboardingTimeBody("4200")).toEqual({
      ok: false,
      error: "durationMs must be a non-negative finite number.",
    });
  });

  it("rejects NaN", () => {
    expect(validateOnboardingTimeBody({ durationMs: NaN })).toEqual({
      ok: false,
      error: "durationMs must be a non-negative finite number.",
    });
  });
});
