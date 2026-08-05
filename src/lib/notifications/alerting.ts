export interface DispatchFailureAlert {
  error: unknown;
  attempts: number;
}

/**
 * Best-effort webhook alert for a nightly dispatch run that still failed
 * after retrying (ADR 0061). Reads DISPATCH_ALERT_WEBHOOK_URL at the point
 * of use (mirrors ADR 0047/0050's env-read pattern) -- unset is a
 * documented config gap: logs a warning and returns, same fail-safe shape
 * as push-sender.ts's missing-VAPID-config path. Never throws: a broken or
 * unreachable webhook must not stop the route from responding 503.
 */
export async function alertNightlyDispatchFailure(alert: DispatchFailureAlert): Promise<void> {
  const webhookUrl = process.env.DISPATCH_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn(
      "[alerting] DISPATCH_ALERT_WEBHOOK_URL is unset -- nightly dispatch failure alert not sent.",
    );
    return;
  }

  const message = alert.error instanceof Error ? alert.error.message : String(alert.error);
  const body = JSON.stringify({
    event: "nightly_dispatch_failed",
    message,
    attempts: alert.attempts,
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) {
      console.error(`[alerting] Webhook responded with status ${response.status}.`);
    }
  } catch (err) {
    console.error("[alerting] Failed to deliver nightly dispatch failure alert:", err);
  }
}
