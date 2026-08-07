// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { getDb } from "@/lib/db";
import { computeCollectionRuleSet, type ZoneClassification } from "@/lib/schedule/rules";
import { sendDispatchPayload } from "@/lib/notifications/push-sender";
import { sendDispatchBatch, runNightlyDispatch } from "@/lib/notifications/dispatch-runner";
import type { DispatchPayload } from "@/lib/notifications/dispatcher";
import { setupTestDb, teardownTestDb } from "../helpers/api";

vi.mock("@/lib/notifications/push-sender", () => ({
  sendDispatchPayload: vi.fn(),
}));

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const SUBURBAN_ZONE: ZoneClassification = {
  zone: "zone-east",
  isInnerCityNightCollection: false,
  recyclingCalendarGroup: 1,
};

function buildPayload(overrides: Partial<DispatchPayload> = {}): DispatchPayload {
  return {
    subscriptionId: 1,
    endpoint: "https://push.example/one",
    p256dh: "p256dh-key",
    auth: "auth-secret",
    languagePreference: "en",
    collectionDate: "2026-01-12",
    ruleSet: computeCollectionRuleSet(SUBURBAN_ZONE, utcDate(2026, 1, 12)),
    ...overrides,
  };
}

describe("sendDispatchBatch", () => {
  test("attempts every payload even when one fails, returning outcomes in input order", async () => {
    const p1 = buildPayload({ subscriptionId: 1, endpoint: "https://push.example/one" });
    const p2 = buildPayload({ subscriptionId: 2, endpoint: "https://push.example/two" });
    const p3 = buildPayload({ subscriptionId: 3, endpoint: "https://push.example/three" });

    vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => {
      if (payload.subscriptionId === 2) {
        return { subscriptionId: 2, success: false };
      }
      return { subscriptionId: payload.subscriptionId, success: true };
    });

    const result = await sendDispatchBatch([p1, p2, p3]);

    expect(sendDispatchPayload).toHaveBeenCalledTimes(3);
    expect(sendDispatchPayload).toHaveBeenNthCalledWith(1, p1);
    expect(sendDispatchPayload).toHaveBeenNthCalledWith(2, p2);
    expect(sendDispatchPayload).toHaveBeenNthCalledWith(3, p3);
    expect(result).toEqual([
      { subscriptionId: 1, success: true },
      { subscriptionId: 2, success: false },
      { subscriptionId: 3, success: true },
    ]);
  });
});

async function seedDispatchFixtures(): Promise<void> {
  const db = getDb();

  const [suburbanAddressId] = await db("addresses").insert({
    street_name: "Suburban Street",
    suburb: "Karori",
    zone: "zone-east",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 1,
    collection_weekday: 1, // Monday — matches NOW's tomorrow (2026-01-12)
  });

  const [innerCityAddressId] = await db("addresses").insert({
    street_name: "Cuba Street",
    suburb: "Te Aro",
    zone: "zone-cbd",
    is_inner_city_night_collection: true,
  });

  await db("push_subscriptions").insert([
    {
      endpoint: "https://push.example/suburban",
      p256dh: "p256dh-suburban",
      auth: "auth-suburban",
      language_preference: "en",
      address_id: suburbanAddressId,
    },
    {
      endpoint: "https://push.example/inner-city",
      p256dh: "p256dh-inner-city",
      auth: "auth-inner-city",
      language_preference: "mi",
      address_id: innerCityAddressId,
    },
  ]);
}

const NOW = new Date("2026-01-11T06:00:00Z"); // 19:00 NZDT on Jan 11 -> tomorrow = Jan 12

describe("runNightlyDispatch", () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedDispatchFixtures();
    vi.clearAllMocks();
    vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => ({
      subscriptionId: payload.subscriptionId,
      success: true,
    }));
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test("sends one payload per seeded subscription", async () => {
    const result = await runNightlyDispatch(NOW);

    expect(sendDispatchPayload).toHaveBeenCalledTimes(2);
    const calledEndpoints = vi.mocked(sendDispatchPayload).mock.calls.map(([payload]) => payload.endpoint);
    expect(calledEndpoints.sort()).toEqual(
      ["https://push.example/inner-city", "https://push.example/suburban"].sort(),
    );
    expect(result).toHaveLength(2);
  });

  test("calling twice in a row does not leak or duplicate state", async () => {
    const result = await runNightlyDispatch(NOW);

    expect(sendDispatchPayload).toHaveBeenCalledTimes(4);
    expect(result).toHaveLength(2);
  });
});

describe("runNightlyDispatch — pruning (issue #111)", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  async function seedOneSubscription(endpoint: string): Promise<number> {
    const db = getDb();
    const [addressId] = await db("addresses").insert({
      street_name: "Suburban Street",
      suburb: "Karori",
      zone: "zone-east",
      is_inner_city_night_collection: false,
      recycling_calendar_group: 1,
      collection_weekday: 1, // Monday — matches NOW's tomorrow (2026-01-12)
    });
    const [subscriptionId] = await db("push_subscriptions").insert({
      endpoint,
      p256dh: "p256dh-key",
      auth: "auth-secret",
      language_preference: "en",
      address_id: addressId,
    });
    return subscriptionId;
  }

  async function subscriptionExists(id: number): Promise<boolean> {
    const row = await getDb()("push_subscriptions").where({ id }).first();
    return row !== undefined;
  }

  test("gone outcome prunes the row", async () => {
    const id = await seedOneSubscription("https://push.example/gone");
    vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => ({
      subscriptionId: payload.subscriptionId,
      success: false,
      failureReason: "gone",
    }));

    await runNightlyDispatch(NOW);

    expect(await subscriptionExists(id)).toBe(false);
  });

  test("transient outcome leaves the row intact", async () => {
    const id = await seedOneSubscription("https://push.example/transient");
    vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => ({
      subscriptionId: payload.subscriptionId,
      success: false,
      failureReason: "transient",
    }));

    await runNightlyDispatch(NOW);

    expect(await subscriptionExists(id)).toBe(true);
  });

  test("successful outcome leaves the row intact", async () => {
    const id = await seedOneSubscription("https://push.example/success");
    vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => ({
      subscriptionId: payload.subscriptionId,
      success: true,
    }));

    await runNightlyDispatch(NOW);

    expect(await subscriptionExists(id)).toBe(true);
  });

  test("repetition: a pruned subscription is not dispatched to again", async () => {
    const id = await seedOneSubscription("https://push.example/repeat");
    vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => ({
      subscriptionId: payload.subscriptionId,
      success: false,
      failureReason: "gone",
    }));

    await runNightlyDispatch(NOW);
    expect(await subscriptionExists(id)).toBe(false);

    vi.mocked(sendDispatchPayload).mockClear();
    await runNightlyDispatch(NOW);

    const calledIds = vi.mocked(sendDispatchPayload).mock.calls.map(([payload]) => payload.subscriptionId);
    expect(calledIds).not.toContain(id);
  });
});
