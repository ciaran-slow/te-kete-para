export interface OnboardingTimeRequestBody {
  durationMs: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type ValidateOnboardingTimeBodyResult =
  | { ok: true; value: OnboardingTimeRequestBody }
  | { ok: false; error: string };

export function validateOnboardingTimeBody(
  body: unknown,
): ValidateOnboardingTimeBodyResult {
  if (
    !isRecord(body) ||
    typeof body.durationMs !== "number" ||
    !Number.isFinite(body.durationMs) ||
    body.durationMs < 0
  ) {
    return { ok: false, error: "durationMs must be a non-negative finite number." };
  }
  return { ok: true, value: { durationMs: body.durationMs } };
}

/**
 * Self-hosted, always-on NFR-04 instrumentation (ADR 0076): logs a
 * structured line so the onboarding-time success metric (PRD v1 §1) is
 * reviewable in server logs. No DB write, no third-party analytics, and no
 * identifier of any kind is accepted or logged alongside the duration.
 */
export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const validation = validateOnboardingTimeBody(body);
  if (!validation.ok) {
    return Response.json({ error: validation.error }, { status: 400 });
  }

  console.log(
    JSON.stringify({
      event: "onboarding_time_recorded",
      durationMs: validation.value.durationMs,
      timestamp: new Date().toISOString(),
    }),
  );

  return new Response(null, { status: 204 });
}
