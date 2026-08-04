"use client";

import { useEffect, useState } from "react";
import { Switch } from "radix-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/dictionaries";
import { StatusRegion } from "./status-region";

export interface PushSubscriptionToggleProps {
  /** Attached to the subscription server-side; matches the API's nullable
   * addressId (ADR 0033). Omitted behaves the same as null. No caller
   * passes this today (the component isn't composed into any route,
   * ADR 0048) — it exists so a future composition can wire the
   * already-selected address straight through, same shape as
   * ShiftAlertBanner's `address` prop (ADR 0018). */
  addressId?: number | null;
}

type Status =
  | { kind: "checking" }
  | { kind: "unsupported" }
  | { kind: "misconfigured" }
  | { kind: "unsubscribed" }
  | { kind: "subscribing" }
  | { kind: "subscribed" }
  | { kind: "unsubscribing" }
  | { kind: "denied" }
  | { kind: "action-error"; from: "unsubscribed" | "subscribed" };

/** Sync feature-detection; no globals are touched beyond `in` checks. */
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Decodes a base64url VAPID public key into the raw Uint8Array
 * `pushManager.subscribe` expects, or returns null for anything that
 * isn't a plausible key: absent, not valid base64url, or not the 65-byte
 * length of an uncompressed P-256 point (every real VAPID public key is
 * exactly 65 bytes — this is what turns a typo'd env var into
 * "misconfigured" instead of a subscribe() call that fails confusingly).
 */
export function parseVapidPublicKey(value: string | undefined): Uint8Array<ArrayBuffer> | null {
  if (!value) return null;
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  try {
    const raw = atob(base64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes.length === 65 ? bytes : null;
  } catch {
    return null;
  }
}

/** Runs once on mount to work out which of the "real" states we're in.
 * Every branch is expressed as a resolved value passed through `.then`,
 * never a synchronous setState call reachable from the effect body
 * itself — react-hooks/set-state-in-effect is error-level here (ADR
 * 0009), same technique ShiftAlertBanner's data effect uses. */
async function determineInitialStatus(): Promise<Status> {
  if (!isPushSupported()) return { kind: "unsupported" };
  if (parseVapidPublicKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) === null) {
    return { kind: "misconfigured" };
  }
  if (Notification.permission === "denied") return { kind: "denied" };
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return { kind: subscription ? "subscribed" : "unsubscribed" };
  } catch {
    return { kind: "unsubscribed" };
  }
}

const STATUS_TEXT_KEY: Record<Status["kind"], TranslationKey> = {
  checking: "pushOptIn.status.checking",
  unsupported: "pushOptIn.status.unsupported",
  misconfigured: "pushOptIn.status.misconfigured",
  unsubscribed: "pushOptIn.status.unsubscribed",
  subscribing: "pushOptIn.status.subscribing",
  subscribed: "pushOptIn.status.subscribed",
  unsubscribing: "pushOptIn.status.unsubscribing",
  denied: "pushOptIn.status.denied",
  "action-error": "pushOptIn.status.subscribeError", // overridden below per `from`
};

function statusTextKey(status: Status): TranslationKey {
  if (status.kind === "action-error") {
    return status.from === "subscribed"
      ? "pushOptIn.status.unsubscribeError"
      : "pushOptIn.status.subscribeError";
  }
  return STATUS_TEXT_KEY[status.kind];
}

export function PushSubscriptionToggle({ addressId }: PushSubscriptionToggleProps) {
  const { t, locale } = useTranslation();
  const [status, setStatus] = useState<Status>({ kind: "checking" });

  useEffect(() => {
    let mounted = true;
    determineInitialStatus().then((next) => {
      if (mounted) setStatus(next);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSubscribe() {
    setStatus({ kind: "subscribing" });
    const key = parseVapidPublicKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
    if (key === null) {
      setStatus({ kind: "misconfigured" });
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const keys = subscription.toJSON().keys;
      if (!keys?.p256dh || !keys?.auth) {
        // Defensive only: unreachable when subscribe() itself resolved —
        // a resolved PushSubscription always carries both keys.
        throw new Error("push-subscription-missing-keys");
      }
      const response = await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          languagePreference: locale,
          addressId: addressId ?? undefined,
        }),
      });
      if (!response.ok) throw new Error("subscribe-post-failed");
      setStatus({ kind: "subscribed" });
    } catch {
      if (Notification.permission === "denied") {
        setStatus({ kind: "denied" });
        return;
      }
      // Roll back any browser-level subscription created before the
      // failure. Without this, getSubscription() would keep reporting
      // "subscribed" on a later mount even though the server never
      // stored it — the two sides must never diverge.
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        await existing?.unsubscribe();
      } catch {
        // best-effort rollback
      }
      setStatus({ kind: "action-error", from: "unsubscribed" });
    }
  }

  async function handleUnsubscribe() {
    setStatus({ kind: "unsubscribing" });
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription === null) {
        setStatus({ kind: "unsubscribed" });
        return;
      }
      const response = await fetch("/api/notifications/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      if (!response.ok) throw new Error("unsubscribe-delete-failed");
      await subscription.unsubscribe();
      setStatus({ kind: "unsubscribed" });
    } catch {
      // Leave the browser-level subscription intact on failure — the
      // server never confirmed removal, so staying "subscribed" (and
      // letting the user retry) is the state that doesn't lie.
      setStatus({ kind: "action-error", from: "subscribed" });
    }
  }

  function handleCheckedChange(checked: boolean) {
    if (checked && (status.kind === "unsubscribed" || (status.kind === "action-error" && status.from === "unsubscribed"))) {
      void handleSubscribe();
    } else if (!checked && (status.kind === "subscribed" || (status.kind === "action-error" && status.from === "subscribed"))) {
      void handleUnsubscribe();
    }
  }

  const checked =
    status.kind === "subscribed" ||
    status.kind === "subscribing" ||
    status.kind === "unsubscribing" ||
    (status.kind === "action-error" && status.from === "subscribed");
  const disabled =
    status.kind === "checking" ||
    status.kind === "unsupported" ||
    status.kind === "misconfigured" ||
    status.kind === "denied" ||
    status.kind === "subscribing" ||
    status.kind === "unsubscribing";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <label htmlFor="push-opt-in" className="text-sm font-medium text-papa-ink">
          {t("pushOptIn.label")}
        </label>
        <Switch.Root
          id="push-opt-in"
          checked={checked}
          disabled={disabled}
          onCheckedChange={handleCheckedChange}
          className="touch-target focus-ring relative h-6 w-11 rounded-full bg-papa-ink/30 transition-colors data-[state=checked]:bg-kakariki disabled:opacity-50"
        >
          <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-papa transition-transform data-[state=checked]:translate-x-5" />
        </Switch.Root>
      </div>
      <StatusRegion as="p" className="text-sm text-papa-ink">
        {t(statusTextKey(status))}
      </StatusRegion>
    </div>
  );
}
