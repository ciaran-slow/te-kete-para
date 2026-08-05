// @vitest-environment node
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { getDb } from "@/lib/db";
import { pruneGoneSubscriptions } from "@/lib/notifications/subscription-pruner";
import { setupTestDb, teardownTestDb } from "../helpers/api";

async function seedSubscription(endpoint: string): Promise<number> {
  const db = getDb();
  const [id] = await db("push_subscriptions").insert({
    endpoint,
    p256dh: "p256dh-key",
    auth: "auth-secret",
    language_preference: "en",
    address_id: null,
  });
  return id;
}

async function subscriptionExists(id: number): Promise<boolean> {
  const row = await getDb()("push_subscriptions").where({ id }).first();
  return row !== undefined;
}

describe("pruneGoneSubscriptions", () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test("happy path: deletes only the subscription whose outcome is 'gone'", async () => {
    const a = await seedSubscription("https://push.example/a");
    const b = await seedSubscription("https://push.example/b");
    const c = await seedSubscription("https://push.example/c");

    await pruneGoneSubscriptions([
      { subscriptionId: a, success: false, failureReason: "gone" },
      { subscriptionId: b, success: false, failureReason: "transient" },
      { subscriptionId: c, success: true },
    ]);

    expect(await subscriptionExists(a)).toBe(false);
    expect(await subscriptionExists(b)).toBe(true);
    expect(await subscriptionExists(c)).toBe(true);
  });

  test("no gone outcomes is a no-op", async () => {
    const id = await seedSubscription("https://push.example/no-gone");

    await expect(
      pruneGoneSubscriptions([
        { subscriptionId: id, success: false, failureReason: "transient" },
        { subscriptionId: id + 999, success: true },
      ]),
    ).resolves.toBeUndefined();

    expect(await subscriptionExists(id)).toBe(true);
  });

  test("multiple gone ids in one call all get deleted", async () => {
    const d = await seedSubscription("https://push.example/d");
    const e = await seedSubscription("https://push.example/e");

    await pruneGoneSubscriptions([
      { subscriptionId: d, success: false, failureReason: "gone" },
      { subscriptionId: e, success: false, failureReason: "gone" },
    ]);

    expect(await subscriptionExists(d)).toBe(false);
    expect(await subscriptionExists(e)).toBe(false);
  });

  test("repetition: pruning the same id twice does not throw", async () => {
    const f = await seedSubscription("https://push.example/f");

    await pruneGoneSubscriptions([{ subscriptionId: f, success: false, failureReason: "gone" }]);
    expect(await subscriptionExists(f)).toBe(false);

    await expect(
      pruneGoneSubscriptions([{ subscriptionId: f, success: false, failureReason: "gone" }]),
    ).resolves.toBeUndefined();
  });

  test("empty outcomes array is a no-op", async () => {
    await expect(pruneGoneSubscriptions([])).resolves.toBeUndefined();
  });
});
