"use client";

import { useMemo, useSyncExternalStore } from "react";
import { AddressSearch } from "@/components/address-search";
import { ScheduleDisplay } from "@/components/schedule-display";
import { ShiftAlertBanner } from "@/components/shift-alert-banner";
import {
  getServerCachedAddressRaw,
  parseCachedAddress,
  readCachedAddressRaw,
  subscribeToCachedAddress,
  writeCachedAddress,
} from "@/lib/schedule/address-cache";

/**
 * Page-specific composition, colocated with (not exported from) page.tsx —
 * same convention as home-copy.tsx (ADR 0011). The selected address is
 * sourced from localStorage via useSyncExternalStore, not local component
 * state, so it survives reload/offline relaunch (ADR 0052, issue #30) while
 * still starting `null` identically on the server and the client's first
 * render (ADR 0018) — see ADR 0052 for why that stays safe. `AddressSearch`,
 * `ShiftAlertBanner`, and `ScheduleDisplay` all read this same `selected`
 * value.
 */
export function AddressSchedule() {
  const rawCachedAddress = useSyncExternalStore(
    subscribeToCachedAddress,
    readCachedAddressRaw,
    getServerCachedAddressRaw,
  );
  const selected = useMemo(
    () => parseCachedAddress(rawCachedAddress),
    [rawCachedAddress],
  );

  return (
    <div className="flex w-full max-w-md flex-col items-stretch gap-4">
      <AddressSearch onSelect={writeCachedAddress} />
      <ShiftAlertBanner address={selected} />
      <ScheduleDisplay address={selected} />
    </div>
  );
}
