import { collectNightlyDispatchCandidates, type DispatchPayload } from "./dispatcher";
import { sendDispatchPayload, type DispatchOutcome } from "./push-sender";

export type { DispatchOutcome } from "./push-sender";

/** DB-free: takes payloads directly. Every element of `sendDispatchPayload`
 * always resolves (never rejects), so Promise.all here can never short-
 * circuit on one failure -- all payloads are always attempted. */
export async function sendDispatchBatch(payloads: DispatchPayload[]): Promise<DispatchOutcome[]> {
  return Promise.all(payloads.map((payload) => sendDispatchPayload(payload)));
}

/** DB-aware entry point -- what #110 calls nightly. */
export async function runNightlyDispatch(now: Date): Promise<DispatchOutcome[]> {
  const candidates = await collectNightlyDispatchCandidates(now);
  return sendDispatchBatch(candidates);
}
