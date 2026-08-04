import { getDb } from "@/lib/db";
import { LOCALES, type Locale } from "@/lib/i18n/dictionaries";

export interface SubscribeRequestBody {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  languagePreference?: Locale;
  addressId?: number | null;
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

  return {
    ok: true,
    value: {
      endpoint: body.endpoint,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      languagePreference,
      addressId,
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
    const [row]: PushSubscriptionRow[] = await db("push_subscriptions")
      .insert({
        endpoint: value.endpoint,
        p256dh: value.keys.p256dh,
        auth: value.keys.auth,
        language_preference: value.languagePreference ?? "en",
        address_id: value.addressId ?? null,
      })
      .onConflict("endpoint")
      .merge(["p256dh", "auth", "language_preference", "address_id", "updated_at"])
      .returning(["id", "endpoint", "language_preference", "address_id"]);

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
