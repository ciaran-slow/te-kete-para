import { getDb } from "@/lib/db";
import type { DispatchOutcome } from "./push-sender";

/**
 * Deletes every push_subscriptions row whose nightly outcome reported a
 * definitive "gone" signal (ADR 0057: single-strike, no retry counter).
 * Transient failures and successes are left untouched. Deleting an id with
 * no matching row (already pruned, or never existed) is a no-op, mirroring
 * DELETE /api/notifications/subscribe's idempotent-delete convention (ADR
 * 0034).
 */
export async function pruneGoneSubscriptions(outcomes: DispatchOutcome[]): Promise<void> {
  const goneIds = outcomes
    .filter((outcome) => outcome.failureReason === "gone")
    .map((outcome) => outcome.subscriptionId);
  if (goneIds.length === 0) return;

  const db = getDb();
  await db("push_subscriptions").whereIn("id", goneIds).del();
}
