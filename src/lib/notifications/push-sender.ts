import webpush from "web-push";
import type { DispatchPayload } from "./dispatcher";
import { buildLocalizedPushContent } from "./payload-builder";

export type DeliveryFailureReason = "gone" | "transient";

export interface DispatchOutcome {
  subscriptionId: number;
  success: boolean;
  /**
   * Present only when success is false. "gone" = the push service returned
   * 404 or 410 -- Web Push's own protocol convention for "this endpoint
   * is permanently invalid, stop sending" -- everything else (5xx, network
   * failure, missing/invalid VAPID config) is "transient": no evidence the
   * endpoint is dead. #111/ADR 0057 prunes only on "gone".
   */
  failureReason?: DeliveryFailureReason;
}

function classifyDeliveryFailure(error: unknown): DeliveryFailureReason {
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode: unknown }).statusCode
      : undefined;
  return statusCode === 404 || statusCode === 410 ? "gone" : "transient";
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Reads VAPID config at the point of use (not a module-level constant) so
 * it's testable per-test via vi.stubEnv, same rationale as ADR 0047's
 * client-side NEXT_PUBLIC_VAPID_PUBLIC_KEY read. Any of the three absent or
 * empty is treated as "not configured" -- see ADR 0050.
 */
function loadVapidConfig(): VapidConfig | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Sends one payload via the Web Push protocol. Never throws/rejects --
 * every failure (missing config, an invalid-format key/subject, a rejected
 * sendNotification call) is logged and folded into `{ success: false }` so
 * one subscriber's failure can never block another's send (issue #28
 * acceptance criteria). `setVapidDetails` is called *inside* the same
 * try/catch as `sendNotification` -- it validates key/subject format
 * synchronously and throws on a malformed (as opposed to merely absent)
 * value, and that throw must be caught here too, not just the missing-env
 * case. Delivery failure content (e.g. a 410 Gone) is classified into a
 * `failureReason` so the caller can act on it, but acting on it (pruning
 * the subscription) still happens elsewhere -- `subscription-pruner.ts`,
 * called from `dispatch-runner.ts` (#111, ADR 0057).
 */
export async function sendDispatchPayload(payload: DispatchPayload): Promise<DispatchOutcome> {
  const config = loadVapidConfig();
  if (config === null) {
    console.error(
      `[push-sender] VAPID not configured (need NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT) -- skipping subscription ${payload.subscriptionId}.`,
    );
    return { subscriptionId: payload.subscriptionId, success: false, failureReason: "transient" };
  }

  try {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
    const content = buildLocalizedPushContent(payload);
    await webpush.sendNotification(
      { endpoint: payload.endpoint, keys: { p256dh: payload.p256dh, auth: payload.auth } },
      JSON.stringify({ ...content, collectionDate: payload.collectionDate }),
    );
    return { subscriptionId: payload.subscriptionId, success: true };
  } catch (error) {
    console.error(`[push-sender] Delivery failed for subscription ${payload.subscriptionId}:`, error);
    return {
      subscriptionId: payload.subscriptionId,
      success: false,
      failureReason: classifyDeliveryFailure(error),
    };
  }
}
