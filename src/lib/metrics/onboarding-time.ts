/**
 * Self-hosted, always-on NFR-04 instrumentation (ADR 0076). Fire-and-forget
 * by design — a metrics report must never affect or block the onboarding
 * experience it's measuring.
 */
export function reportOnboardingTime(durationMs: number): void {
  try {
    void fetch("/api/metrics/onboarding-time", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMs }),
      keepalive: true,
    }).catch(() => {
      /* best-effort */
    });
  } catch {
    /* best-effort */
  }
}
