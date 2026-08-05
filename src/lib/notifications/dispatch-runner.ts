import { collectNightlyDispatchCandidates, type DispatchPayload } from "./dispatcher";
import { sendDispatchPayload, type DispatchOutcome } from "./push-sender";
import { pruneGoneSubscriptions } from "./subscription-pruner";

export type { DispatchOutcome } from "./push-sender";

/** DB-free: takes payloads directly. Every element of `sendDispatchPayload`
 * always resolves (never rejects), so Promise.all here can never short-
 * circuit on one failure -- all payloads are always attempted. */
export async function sendDispatchBatch(payloads: DispatchPayload[]): Promise<DispatchOutcome[]> {
  return Promise.all(payloads.map((payload) => sendDispatchPayload(payload)));
}

/**
 * DB-aware entry point -- what #110 calls nightly. Prunes any subscription
 * whose send came back with a definitive gone signal (#111, ADR 0057) once
 * every payload in the batch has been attempted. A pruning failure is
 * logged and swallowed, not rethrown: pruning is cleanup, not delivery, so
 * its failure must never make a night where every push was actually sent
 * look like a failed run. It also removes the only rejection source that
 * would otherwise occur *after* sends happen -- the remaining rejection
 * source, `collectNightlyDispatchCandidates`'s DB read, always happens
 * *before* any push is sent, which is what makes the route-level retry
 * (ADR 0061, #122) safe to apply to the whole call without risking a
 * re-send of a push that already went out.
 */
export async function runNightlyDispatch(now: Date): Promise<DispatchOutcome[]> {
  const candidates = await collectNightlyDispatchCandidates(now);
  const outcomes = await sendDispatchBatch(candidates);
  try {
    await pruneGoneSubscriptions(outcomes);
  } catch (err) {
    console.error("[dispatch-runner] Pruning gone subscriptions failed (non-fatal):", err);
  }
  return outcomes;
}
