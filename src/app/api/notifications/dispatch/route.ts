import { runNightlyDispatch } from "@/lib/notifications/dispatch-runner";

/**
 * Vercel Cron always invokes this path with GET (vercel.json has no way to
 * configure another method) and, when CRON_SECRET is set in the deploy
 * environment, automatically sends `Authorization: Bearer <CRON_SECRET>` —
 * Vercel's own documented convention for securing Cron Job trigger routes.
 * CRON_SECRET unset is a documented config gap (ADR 0056, extending ADR
 * 0047/0050's pattern): every environment without it fails closed (503,
 * distinct from a wrong/missing header's 401) rather than accepting every
 * request or crashing.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json(
      { error: "Nightly dispatch trigger is not configured (CRON_SECRET is unset)." },
      { status: 503 },
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const outcomes = await runNightlyDispatch(new Date());
    const succeeded = outcomes.filter((outcome) => outcome.success).length;
    return Response.json({
      attempted: outcomes.length,
      succeeded,
      failed: outcomes.length - succeeded,
    });
  } catch (err) {
    console.error("[api/notifications/dispatch] Nightly dispatch run failed:", err);
    return Response.json({ error: "Nightly dispatch run failed." }, { status: 503 });
  }
}
