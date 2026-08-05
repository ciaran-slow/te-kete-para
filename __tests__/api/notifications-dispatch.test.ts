// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as dispatchRoute from "@/app/api/notifications/dispatch/route";
import { sendDispatchPayload } from "@/lib/notifications/push-sender";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

vi.mock("@/lib/notifications/push-sender", () => ({
  sendDispatchPayload: vi.fn(),
}));

const app = createRequestListener(dispatchRoute);
const ROUTE = "/api/notifications/dispatch";
const SECRET = "test-cron-secret";

describe("GET /api/notifications/dispatch", () => {
  beforeAll(async () => {
    await setupTestDb();
    vi.stubEnv("CRON_SECRET", SECRET);

    const [resolvableAddressId] = await getDb()("addresses").insert({
      street_name: "Suburban Street",
      suburb: "Karori",
      zone: "zone-east",
      is_inner_city_night_collection: false,
      recycling_calendar_group: 1,
    });

    await getDb()("push_subscriptions").insert([
      {
        endpoint: "https://push.example/dispatch-resolvable-one",
        p256dh: "p256dh-one",
        auth: "auth-one",
        language_preference: "en",
        address_id: resolvableAddressId,
      },
      {
        endpoint: "https://push.example/dispatch-resolvable-two",
        p256dh: "p256dh-two",
        auth: "auth-two",
        language_preference: "en",
        address_id: resolvableAddressId,
      },
      {
        endpoint: "https://push.example/dispatch-unresolvable",
        p256dh: "p256dh-unresolvable",
        auth: "auth-unresolvable",
        language_preference: "en",
        address_id: null,
      },
    ]);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await teardownTestDb();
  });

  beforeEach(() => {
    vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => ({
      subscriptionId: payload.subscriptionId,
      success: true,
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("authenticated — mixed success/failure", () => {
    it("attempts only the resolvable subscriptions, reporting per-outcome counts", async () => {
      vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => {
        if (payload.endpoint === "https://push.example/dispatch-resolvable-two") {
          return { subscriptionId: payload.subscriptionId, success: false };
        }
        return { subscriptionId: payload.subscriptionId, success: true };
      });

      const response = await request(app).get(ROUTE).set("Authorization", `Bearer ${SECRET}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ attempted: 2, succeeded: 1, failed: 1 });
      expect(sendDispatchPayload).toHaveBeenCalledTimes(2);
    });
  });

  describe("auth failure paths", () => {
    it("returns 401 when no Authorization header is sent", async () => {
      const response = await request(app).get(ROUTE);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Unauthorized." });
    });

    it("returns 401 when the bearer secret is wrong", async () => {
      const response = await request(app).get(ROUTE).set("Authorization", "Bearer wrong-secret");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: "Unauthorized." });
    });

    it("accepts the correct secret regardless of header name capitalization", async () => {
      const response = await request(app).get(ROUTE).set("authorization", `Bearer ${SECRET}`);

      expect(response.status).toBe(200);
    });
  });

  describe("CRON_SECRET unset (config gap)", () => {
    beforeEach(() => {
      vi.stubEnv("CRON_SECRET", "");
    });

    afterEach(() => {
      vi.stubEnv("CRON_SECRET", SECRET);
    });

    it("returns 503 with no Authorization header", async () => {
      const response = await request(app).get(ROUTE);

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: "Nightly dispatch trigger is not configured (CRON_SECRET is unset).",
      });
    });

    it("returns 503 even with an Authorization header present", async () => {
      const response = await request(app).get(ROUTE).set("Authorization", "Bearer anything");

      expect(response.status).toBe(503);
      expect(response.body).toEqual({
        error: "Nightly dispatch trigger is not configured (CRON_SECRET is unset).",
      });
    });
  });

  describe("repetition — no leak/duplication across repeated runs", () => {
    it("produces identical counts across three consecutive calls", async () => {
      for (let i = 0; i < 3; i++) {
        const response = await request(app).get(ROUTE).set("Authorization", `Bearer ${SECRET}`);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ attempted: 2, succeeded: 2, failed: 0 });
      }

      expect(sendDispatchPayload).toHaveBeenCalledTimes(6);
    });
  });

  describe("method not exported", () => {
    it("returns 405 with an Allow: GET header for PUT", async () => {
      const response = await request(app).put(ROUTE).set("Authorization", `Bearer ${SECRET}`);

      expect(response.status).toBe(405);
      expect(response.headers.allow).toBe("GET");
    });
  });
});
