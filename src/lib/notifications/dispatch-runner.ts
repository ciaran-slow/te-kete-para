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
 * every payload in the batch has been attempted.
 */
export async function runNightlyDispatch(now: Date): Promise<DispatchOutcome[]> {
  const candidates = await collectNightlyDispatchCandidates(now);
  const outcomes = await sendDispatchBatch(candidates);
  await pruneGoneSubscriptions(outcomes);
  return outcomes;
}
