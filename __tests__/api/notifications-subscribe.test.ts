// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { getDb } from "@/lib/db";
import * as subscribeRoute from "@/app/api/notifications/subscribe/route";
import {
  toPushSubscriptionApiRecord,
  validateSubscribeBody,
} from "@/app/api/notifications/subscribe/route";
import { createRequestListener, setupTestDb, teardownTestDb } from "../helpers/api";

const app = createRequestListener(subscribeRoute);
const ROUTE = "/api/notifications/subscribe";

describe("POST/DELETE /api/notifications/subscribe", () => {
  let addressId: number;

  beforeAll(async () => {
    await setupTestDb();
    const [id] = await getDb()("addresses").insert({
      street_name: "Cuba Street",
      suburb: "Te Aro",
      zone: "CBD-INNER",
      is_inner_city_night_collection: true,
    });
    addressId = id;
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  describe("POST — happy path", () => {
    it("subscribes with keys, languagePreference and addressId, returning the exact response shape", async () => {
      const response = await request(app).post(ROUTE).send({
        endpoint: "https://push.example/one",
        keys: { p256dh: "p256dh-key", auth: "auth-secret" },
        languagePreference: "mi",
        addressId,
      });

      expect(response.status).toBe(200);
      expect(Object.keys(response.body.subscription).sort()).toEqual([
        "addressId",
        "endpoint",
        "id",
        "languagePreference",
      ]);
      expect(response.body.subscription).toEqual({
        id: expect.any(Number),
        endpoint: "https://push.example/one",
        languagePreference: "mi",
        addressId,
      });
    });

    it('defaults languagePreference to "en" when omitted', async () => {
      const response = await request(app).post(ROUTE).send({
        endpoint: "https://push.example/two",
        keys: { p256dh: "key", auth: "secret" },
      });

      expect(response.status).toBe(200);
      expect(response.body.subscription.languagePreference).toBe("en");
    });

    it("defaults addressId to null when omitted", async () => {
      const response = await request(app).post(ROUTE).send({
        endpoint: "https://push.example/three",
        keys: { p256dh: "key", auth: "secret" },
      });

      expect(response.status).toBe(200);
      expect(response.body.subscription.addressId).toBeNull();
    });

    it("persists p256dh/auth in the row even though the response omits them", async () => {
      const endpoint = "https://push.example/four";
      await request(app)
        .post(ROUTE)
        .send({ endpoint, keys: { p256dh: "stored-key", auth: "stored-secret" } });

      const row = await getDb()("push_subscriptions").where({ endpoint }).first();
      expect(row).toMatchObject({
        endpoint,
        p256dh: "stored-key",
        auth: "stored-secret",
      });
    });
  });

  describe("POST — validation failure path", () => {
    it("rejects a missing endpoint", async () => {
      const response = await request(app)
        .post(ROUTE)
        .send({ keys: { p256dh: "key", auth: "secret" } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "endpoint is required." });
    });

    it("rejects a missing keys object entirely", async () => {
      const response = await request(app)
        .post(ROUTE)
        .send({ endpoint: "https://push.example/validate" });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "keys is required." });
    });

    it("rejects a missing keys.p256dh", async () => {
      const response = await request(app)
        .post(ROUTE)
        .send({ endpoint: "https://push.example/validate", keys: { auth: "secret" } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "keys.p256dh is required." });
    });

    it("rejects a missing keys.auth", async () => {
      const response = await request(app)
        .post(ROUTE)
        .send({ endpoint: "https://push.example/validate", keys: { p256dh: "key" } });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "keys.auth is required." });
    });

    it('rejects languagePreference: "fr", which is not in LOCALES', async () => {
      const response = await request(app).post(ROUTE).send({
        endpoint: "https://push.example/validate",
        keys: { p256dh: "key", auth: "secret" },
        languagePreference: "fr",
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'languagePreference must be "en" or "mi".',
      });
    });

    it.each([-1, 1.5])("rejects addressId: %s as not a positive integer", async (addressIdCandidate) => {
      const response = await request(app).post(ROUTE).send({
        endpoint: "https://push.example/validate",
        keys: { p256dh: "key", auth: "secret" },
        addressId: addressIdCandidate,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: "addressId must be a positive integer.",
      });
    });

    it("maps an unknown addressId's FK failure to 400, not 503", async () => {
      const response = await request(app).post(ROUTE).send({
        endpoint: "https://push.example/unknown-address",
        keys: { p256dh: "key", auth: "secret" },
        addressId: 999999,
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "Unknown addressId." });
    });

    it("rejects a malformed JSON body with 400, not a 500/503", async () => {
      const response = await request(app)
        .post(ROUTE)
        .set("Content-Type", "application/json")
        .send("this is not json");

      expect(response.status).toBe(400);
    });
  });

  describe("POST — duplicate subscribe (upsert, ADR 0033)", () => {
    it("upserts on endpoint: a second POST updates the same row rather than creating a new one", async () => {
      const endpoint = "https://push.example/dup-one";
      const first = await request(app).post(ROUTE).send({
        endpoint,
        keys: { p256dh: "key-1", auth: "secret-1" },
        languagePreference: "en",
      });
      const second = await request(app).post(ROUTE).send({
        endpoint,
        keys: { p256dh: "key-2", auth: "secret-2" },
        languagePreference: "mi",
      });

      expect(second.body.subscription.id).toBe(first.body.subscription.id);

      const rows = await getDb()("push_subscriptions").where({ endpoint });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        p256dh: "key-2",
        auth: "secret-2",
        language_preference: "mi",
      });
    });

    it("a re-subscribe that omits addressId overwrites a previously stored one with null", async () => {
      const endpoint = "https://push.example/dup-two";
      await request(app)
        .post(ROUTE)
        .send({ endpoint, keys: { p256dh: "key", auth: "secret" }, addressId });

      const second = await request(app)
        .post(ROUTE)
        .send({ endpoint, keys: { p256dh: "key", auth: "secret" } });

      expect(second.body.subscription.addressId).toBeNull();
    });

    it("stays idempotent across three consecutive identical subscribes", async () => {
      const endpoint = "https://push.example/dup-three";
      const body = { endpoint, keys: { p256dh: "key", auth: "secret" } };

      const ids: number[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await request(app).post(ROUTE).send(body);
        ids.push(response.body.subscription.id);
      }

      expect(new Set(ids).size).toBe(1);
      const rows = await getDb()("push_subscriptions").where({ endpoint });
      expect(rows).toHaveLength(1);
    });

    it("updates updated_at on a re-subscribe of the same endpoint, not just on first insert", async () => {
      const endpoint = "https://push.example/dup-updated-at";
      await request(app)
        .post(ROUTE)
        .send({ endpoint, keys: { p256dh: "key-1", auth: "secret-1" } });

      const firstRow = await getDb()("push_subscriptions").where({ endpoint }).first();

      // SQLite's CURRENT_TIMESTAMP (ADR-0033's migration) has one-second
      // resolution — cross a real second boundary so the two values are
      // guaranteed to differ, not just usually differ.
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await request(app)
        .post(ROUTE)
        .send({ endpoint, keys: { p256dh: "key-2", auth: "secret-2" } });

      const secondRow = await getDb()("push_subscriptions").where({ endpoint }).first();

      expect(secondRow.updated_at).not.toEqual(firstRow.updated_at);
      expect(new Date(`${secondRow.updated_at}Z`).getTime()).toBeGreaterThan(
        new Date(`${firstRow.updated_at}Z`).getTime(),
      );
      // created_at must be untouched by the merge — only updated_at moves.
      expect(secondRow.created_at).toEqual(firstRow.created_at);
    });
  });

  describe("DELETE", () => {
    it("removes an existing subscription and confirms zero rows remain", async () => {
      const endpoint = "https://push.example/delete-one";
      await request(app)
        .post(ROUTE)
        .send({ endpoint, keys: { p256dh: "key", auth: "secret" } });

      const response = await request(app).delete(ROUTE).send({ endpoint });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: true });

      const rows = await getDb()("push_subscriptions").where({ endpoint });
      expect(rows).toHaveLength(0);
    });

    it("deletes only the targeted endpoint, leaving an unrelated subscription in place", async () => {
      const targetEndpoint = "https://push.example/delete-scoped-target";
      const otherEndpoint = "https://push.example/delete-scoped-other";
      await request(app)
        .post(ROUTE)
        .send({ endpoint: targetEndpoint, keys: { p256dh: "key", auth: "secret" } });
      await request(app)
        .post(ROUTE)
        .send({ endpoint: otherEndpoint, keys: { p256dh: "key", auth: "secret" } });

      const response = await request(app).delete(ROUTE).send({ endpoint: targetEndpoint });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: true });

      const targetRows = await getDb()("push_subscriptions").where({ endpoint: targetEndpoint });
      expect(targetRows).toHaveLength(0);
      const otherRows = await getDb()("push_subscriptions").where({ endpoint: otherEndpoint });
      expect(otherRows).toHaveLength(1);
    });

    it("reports deleted: false for an endpoint that was never subscribed", async () => {
      const response = await request(app)
        .delete(ROUTE)
        .send({ endpoint: "https://push.example/never-subscribed" });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: false });
    });

    it("reports deleted: false when repeating the delete for an already-removed endpoint", async () => {
      const endpoint = "https://push.example/delete-again";
      await request(app)
        .post(ROUTE)
        .send({ endpoint, keys: { p256dh: "key", auth: "secret" } });
      await request(app).delete(ROUTE).send({ endpoint });

      const response = await request(app).delete(ROUTE).send({ endpoint });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ deleted: false });
    });

    it("across three consecutive deletes of a once-subscribed endpoint: true, then false, false", async () => {
      const endpoint = "https://push.example/delete-thrice";
      await request(app)
        .post(ROUTE)
        .send({ endpoint, keys: { p256dh: "key", auth: "secret" } });

      const results: boolean[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const response = await request(app).delete(ROUTE).send({ endpoint });
        results.push(response.body.deleted);
      }

      expect(results).toEqual([true, false, false]);
    });

    it("rejects a missing endpoint with 400", async () => {
      const response = await request(app).delete(ROUTE).send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "endpoint is required." });
    });

    it("rejects a malformed JSON body with 400 (not 500/503), same as a missing endpoint", async () => {
      const response = await request(app)
        .delete(ROUTE)
        .set("Content-Type", "application/json")
        .send("this is not json");

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: "endpoint is required." });
    });
  });

  it("rejects a verb the route does not export with 405 and an Allow header", async () => {
    const response = await request(app).put(ROUTE);

    expect(response.status).toBe(405);
    expect(response.headers["allow"]).toBe("POST, DELETE");
  });

  describe("toPushSubscriptionApiRecord", () => {
    it("maps a raw snake_case row to the camelCase shape exactly", () => {
      expect(
        toPushSubscriptionApiRecord({
          id: 1,
          endpoint: "https://push.example/mapper",
          language_preference: "mi",
          address_id: 7,
        }),
      ).toEqual({
        id: 1,
        endpoint: "https://push.example/mapper",
        languagePreference: "mi",
        addressId: 7,
      });
    });

    it("passes through a null address_id as-is", () => {
      expect(
        toPushSubscriptionApiRecord({
          id: 2,
          endpoint: "https://push.example/mapper-null",
          language_preference: "en",
          address_id: null,
        }),
      ).toEqual({
        id: 2,
        endpoint: "https://push.example/mapper-null",
        languagePreference: "en",
        addressId: null,
      });
    });
  });

  describe("validateSubscribeBody", () => {
    const validBody = {
      endpoint: "https://push.example/validator",
      keys: { p256dh: "key", auth: "secret" },
    };

    it("accepts a minimally valid body", () => {
      const result = validateSubscribeBody(validBody);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.endpoint).toBe(validBody.endpoint);
        expect(result.value.keys).toEqual(validBody.keys);
        expect(result.value.languagePreference).toBeUndefined();
        expect(result.value.addressId).toBeUndefined();
      }
    });

    it("rejects a non-object body", () => {
      expect(validateSubscribeBody("not an object")).toEqual({
        ok: false,
        error: "endpoint is required.",
      });
    });

    it("rejects a missing endpoint", () => {
      expect(validateSubscribeBody({ keys: validBody.keys })).toEqual({
        ok: false,
        error: "endpoint is required.",
      });
    });

    it("rejects an empty-string endpoint", () => {
      expect(validateSubscribeBody({ ...validBody, endpoint: "" })).toEqual({
        ok: false,
        error: "endpoint is required.",
      });
    });

    it("rejects a missing keys object", () => {
      expect(validateSubscribeBody({ endpoint: validBody.endpoint })).toEqual({
        ok: false,
        error: "keys is required.",
      });
    });

    it("rejects a missing keys.p256dh", () => {
      expect(
        validateSubscribeBody({ ...validBody, keys: { auth: "secret" } }),
      ).toEqual({ ok: false, error: "keys.p256dh is required." });
    });

    it("rejects a missing keys.auth", () => {
      expect(
        validateSubscribeBody({ ...validBody, keys: { p256dh: "key" } }),
      ).toEqual({ ok: false, error: "keys.auth is required." });
    });

    it('accepts languagePreference: "mi"', () => {
      const result = validateSubscribeBody({ ...validBody, languagePreference: "mi" });
      expect(result).toEqual({
        ok: true,
        value: { ...validBody, languagePreference: "mi", addressId: undefined },
      });
    });

    it('rejects languagePreference: "fr"', () => {
      expect(
        validateSubscribeBody({ ...validBody, languagePreference: "fr" }),
      ).toEqual({
        ok: false,
        error: 'languagePreference must be "en" or "mi".',
      });
    });

    it("accepts addressId: 1", () => {
      const result = validateSubscribeBody({ ...validBody, addressId: 1 });
      expect(result).toEqual({
        ok: true,
        value: { ...validBody, languagePreference: undefined, addressId: 1 },
      });
    });

    it("rejects addressId: 0", () => {
      expect(validateSubscribeBody({ ...validBody, addressId: 0 })).toEqual({
        ok: false,
        error: "addressId must be a positive integer.",
      });
    });

    it("rejects addressId: -1", () => {
      expect(validateSubscribeBody({ ...validBody, addressId: -1 })).toEqual({
        ok: false,
        error: "addressId must be a positive integer.",
      });
    });

    it("rejects addressId: 1.5", () => {
      expect(validateSubscribeBody({ ...validBody, addressId: 1.5 })).toEqual({
        ok: false,
        error: "addressId must be a positive integer.",
      });
    });

    it("accepts addressId: null as absent", () => {
      const result = validateSubscribeBody({ ...validBody, addressId: null });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.addressId).toBeUndefined();
      }
    });
  });
});
