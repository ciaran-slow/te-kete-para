// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { getDb } from "@/lib/db";
import { runNightlyDispatch } from "@/lib/notifications/dispatch-runner";
import { sendDispatchPayload } from "@/lib/notifications/push-sender";
import { pruneGoneSubscriptions } from "@/lib/notifications/subscription-pruner";
import { setupTestDb, teardownTestDb } from "../helpers/api";

/**
 * Isolated in its own file (not added to dispatch-runner.test.ts) because it
 * needs to vi.mock("@/lib/notifications/subscription-pruner", ...) at module
 * scope, which would otherwise break dispatch-runner.test.ts's own
 * real-pruning "(issue #111)" describe block -- mirrors the isolation
 * convention noted in __tests__/api/notifications-dispatch-failure.test.ts.
 */
vi.mock("@/lib/notifications/subscription-pruner", () => ({
  pruneGoneSubscriptions: vi.fn(),
}));
vi.mock("@/lib/notifications/push-sender", () => ({
  sendDispatchPayload: vi.fn(),
}));

const NOW = new Date("2026-01-11T06:00:00Z"); // 19:00 NZDT on Jan 11 -> tomorrow = Jan 12

async function seedOneSubscription(endpoint: string): Promise<void> {
  const db = getDb();
  const [addressId] = await db("addresses").insert({
    street_name: "Suburban Street",
    suburb: "Karori",
    zone: "zone-east",
    is_inner_city_night_collection: false,
    recycling_calendar_group: 1,
  });
  await db("push_subscriptions").insert({
    endpoint,
    p256dh: "p256dh-key",
    auth: "auth-secret",
    language_preference: "en",
    address_id: addressId,
  });
}

describe("runNightlyDispatch — pruning failure is non-fatal (ADR 0061)", () => {
  beforeAll(async () => {
    await setupTestDb();
    await seedOneSubscription("https://push.example/prune-failure");
    vi.mocked(sendDispatchPayload).mockImplementation(async (payload) => ({
      subscriptionId: payload.subscriptionId,
      success: true,
    }));
    vi.mocked(pruneGoneSubscriptions).mockRejectedValue(new Error("prune db write failed"));
  });

  afterEach(() => {
    vi.mocked(sendDispatchPayload).mockClear();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test("run still resolves with the send outcomes despite the pruning rejection", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runNightlyDispatch(NOW);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ success: true });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Pruning gone subscriptions failed"),
      expect.any(Error),
    );

    errorSpy.mockRestore();
  });

  test("repetition: calling twice in a row still sends once per subscription per call", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const first = await runNightlyDispatch(NOW);
    const second = await runNightlyDispatch(NOW);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(sendDispatchPayload).toHaveBeenCalledTimes(2);
  });
});
