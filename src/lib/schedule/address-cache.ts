/**
 * localStorage-backed cache of the last-selected address's zone
 * classification, so `<ScheduleDisplay>` can render offline after a reload —
 * ADR 0052, NFR-02. Mirrors src/lib/i18n/locale-storage.ts's
 * useSyncExternalStore pattern (ADR 0009): getSnapshot returns a primitive
 * (the raw stored string, or null) so repeated calls with no underlying
 * change are trivially reference-stable, and getServerSnapshot always
 * returns null so SSR and first client render agree — see ADR 0052 for why
 * that stays safe under ADR 0018's client-only-"today" rule even though it
 * gives `selected` a second way to become non-null.
 */
import type { SuburbSearchResult } from "@/components/address-search";

export const ADDRESS_CACHE_KEY = "tkp.selectedAddress";
export const ADDRESS_CACHE_VERSION = 1;
const ADDRESS_CACHE_CHANGE_EVENT = "tkp:selected-address-change";

interface CachedAddressPayload {
  version: number;
  address: SuburbSearchResult;
}

export function readCachedAddressRaw(): string | null {
  try {
    return window.localStorage.getItem(ADDRESS_CACHE_KEY);
  } catch {
    return null;
  }
}

export function getServerCachedAddressRaw(): string | null {
  return null;
}

export function writeCachedAddress(address: SuburbSearchResult): void {
  try {
    const payload: CachedAddressPayload = {
      version: ADDRESS_CACHE_VERSION,
      address,
    };
    window.localStorage.setItem(ADDRESS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* Private mode / quota: the write is dropped. There is no in-memory
       fallback — getSnapshot re-reads localStorage on every notification, so
       the visible cached address silently reverts to whatever is (or isn't)
       stored, not to the value just written. Mirrors writeStoredLocale. */
  }
  window.dispatchEvent(new Event(ADDRESS_CACHE_CHANGE_EVENT));
}

export function subscribeToCachedAddress(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(ADDRESS_CACHE_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(ADDRESS_CACHE_CHANGE_EVENT, onChange);
  };
}

function isSuburbSearchResult(value: unknown): value is SuburbSearchResult {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "number" &&
    typeof v.streetName === "string" &&
    typeof v.suburb === "string" &&
    typeof v.zone === "string" &&
    typeof v.isInnerCityNightCollection === "boolean"
  );
}

/**
 * Pure parse/validate step — no localStorage access, never throws. A stale
 * version or a malformed/mis-shaped payload is quarantined (dropped, treated
 * as "nothing cached") rather than fed to computeCollectionRuleSet with the
 * wrong shape.
 */
export function parseCachedAddress(
  raw: string | null,
): SuburbSearchResult | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const payload = parsed as Record<string, unknown>;
  if (payload.version !== ADDRESS_CACHE_VERSION) return null;
  if (!isSuburbSearchResult(payload.address)) return null;
  return payload.address;
}
