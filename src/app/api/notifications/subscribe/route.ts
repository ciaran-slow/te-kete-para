import { getDb } from "@/lib/db";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";

export interface SubscribeRequestBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  languagePreference?: Locale;
  addressId?: number | null;
  clientRequestedAt?: number;
}

interface UnsubscribeRequestBody {
  endpoint: string;
}

interface PushSubscriptionRow {
  id: number;
  endpoint: string;
  language_preference: string;
  address_id: number | null;
}

export interface PushSubscriptionApiRecord {
  id: number;
  endpoint: string;
  languagePreference: string;
  addressId: number | null;
}

/** Maps a raw `push_subscriptions` row to the API's camelCase contract (ADR 0013). */
export function toPushSubscriptionApiRecord(
  row: PushSubscriptionRow,
): PushSubscriptionApiRecord {
  return {
    id: row.id,
    endpoint: row.endpoint,
    languagePreference: row.language_preference,
    addressId: row.address_id,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

export type ValidateSubscribeBodyResult =
  | { ok: true; value: SubscribeRequestBody }
  | { ok: false; error: string };

/**
 * Validates and narrows an unknown request body into a `SubscribeRequestBody`.
 * Rules are checked in order — the first failure wins (ADR 0033).
 */
export function validateSubscribeBody(body: unknown): ValidateSubscribeBodyResult {
  if (!isRecord(body) || !isNonEmptyString(body.endpoint)) {
    return { ok: false, error: "endpoint is required." };
  }

  if (!isRecord(body.keys)) {
    return { ok: false, error: "keys is required." };
  }

  if (!isNonEmptyString(body.keys.p256dh)) {
    return { ok: false, error: "keys.p256dh is required." };
  }

  if (!isNonEmptyString(body.keys.auth)) {
    return { ok: false, error: "keys.auth is required." };
  }

  let languagePreference: Locale | undefined;
  if (body.languagePreference !== undefined) {
    if (
      typeof body.languagePreference !== "string" ||
      !(LOCALES as readonly string[]).includes(body.languagePreference)
    ) {
      return { ok: false, error: 'languagePreference must be "en" or "mi".' };
    }
    languagePreference = body.languagePreference as Locale;
  }

  let addressId: number | undefined;
  if (body.addressId !== undefined && body.addressId !== null) {
    const candidate = body.addressId;
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate <= 0) {
      return { ok: false, error: "addressId must be a positive integer." };
    }
    addressId = candidate;
  }

  let clientRequestedAt: number | undefined;
  if (body.clientRequestedAt !== undefined) {
    const candidate = body.clientRequestedAt;
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < 0) {
      return { ok: false, error: "clientRequestedAt must be a non-negative integer." };
    }
    clientRequestedAt = candidate;
  }

  return {
    ok: true,
    value: {
      endpoint: body.endpoint,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      languagePreference,
      addressId,
      clientRequestedAt,
    },
  };
}

/**
 * `POST` upserts a subscription keyed on `endpoint` (ADR 0033): a repeat
 * subscribe from the same client — e.g. after a Web Push key rotation —
 * updates the existing row in place rather than erroring. The response
 * omits `p256dh`/`auth`; the client already has both, having just sent them.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json();

    const validation = validateSubscribeBody(body);
    if (!validation.ok) {
      return Response.json({ error: validation.error }, { status: 400 });
    }
    const { value } = validation;

    const db = getDb();
    // Single atomic upsert: the conflict WHERE clause (ADR 0067) compares
    // the incoming clientRequestedAt against the value already stored for
    // this endpoint and no-ops the entire row update — not just
    // address_id — if this write is not newer. RETURNING yields zero rows
    // for that no-op case, so a rejected write falls back to a plain
    // SELECT below; either way the response still reflects the endpoint's
    // current (correct) state, matching ADR 0033's always-200 contract.
    const upserted: PushSubscriptionRow[] = await db.raw(
      `INSERT INTO push_subscriptions
         (endpoint, p256dh, auth, language_preference, address_id, client_requested_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         language_preference = excluded.language_preference,
         address_id = excluded.address_id,
         client_requested_at = COALESCE(excluded.client_requested_at, push_subscriptions.client_requested_at),
         updated_at = excluded.updated_at
       WHERE excluded.client_requested_at IS NULL
          OR push_subscriptions.client_requested_at IS NULL
          OR excluded.client_requested_at > push_subscriptions.client_requested_at
       RETURNING id, endpoint, language_preference, address_id`,
      [
        value.endpoint,
        value.keys.p256dh,
        value.keys.auth,
        value.languagePreference ?? "en",
        value.addressId ?? null,
        value.clientRequestedAt ?? null,
      ],
    );

    const row: PushSubscriptionRow | undefined =
      upserted[0] ??
      (await db<PushSubscriptionRow>("push_subscriptions")
        .where({ endpoint: value.endpoint })
        .first());

    // Unreachable: the INSERT always creates a row for a brand-new
    // endpoint, and a no-op update (empty RETURNING) only happens when a
    // row for this endpoint already exists — exactly what the fallback
    // SELECT above finds.
    if (!row) throw new Error("push subscription upsert produced no row");

    return Response.json({ subscription: toPushSubscriptionApiRecord(row) });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400 },
      );
    }
    if (err instanceof Error && err.message.includes("FOREIGN KEY constraint failed")) {
      return Response.json({ error: "Unknown addressId." }, { status: 400 });
    }
    return Response.json(
      { error: "Unable to store push subscription." },
      { status: 503 },
    );
  }
}

/**
 * `DELETE` removes a subscription keyed on `endpoint` (ADR 0034), always
 * responding `200` — deleting an endpoint that was never subscribed, or was
 * already removed, is not an error (idempotent DELETE).
 */
export async function DELETE(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  if (!isRecord(body) || !isNonEmptyString(body.endpoint)) {
    return Response.json({ error: "endpoint is required." }, { status: 400 });
  }
  const endpoint: UnsubscribeRequestBody["endpoint"] = body.endpoint;

  try {
    const db = getDb();
    const deletedCount: number = await db("push_subscriptions")
      .where({ endpoint })
      .del();

    return Response.json({ deleted: deletedCount > 0 });
  } catch {
    return Response.json(
      { error: "Unable to remove push subscription." },
      { status: 503 },
    );
  }
}
