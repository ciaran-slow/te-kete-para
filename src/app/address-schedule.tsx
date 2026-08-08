"use client";

import { useMemo, useRef, useSyncExternalStore } from "react";
import { AddressSearch, type SuburbSearchResult } from "@/components/address-search";
import { PushSubscriptionToggle } from "@/components/push-subscription-toggle";
import { ScheduleDisplay, computeSchedule } from "@/components/schedule-display";
import { ShiftAlertBanner } from "@/components/shift-alert-banner";
import {
  getServerCachedAddressRaw,
  parseCachedAddress,
  readCachedAddressRaw,
  subscribeToCachedAddress,
  writeCachedAddress,
} from "@/lib/schedule/address-cache";
import { reportOnboardingTime } from "@/lib/metrics/onboarding-time";

/**
 * Page-specific composition, colocated with (not exported from) page.tsx —
 * same convention as home-copy.tsx (ADR 0011). The selected address is
 * sourced from localStorage via useSyncExternalStore, not local component
 * state, so it survives reload/offline relaunch (ADR 0052, issue #30) while
 * still starting `null` identically on the server and the client's first
 * render (ADR 0018) — see ADR 0052 for why that stays safe. `AddressSearch`,
 * `ShiftAlertBanner`, and `ScheduleDisplay` all read this same `selected`
 * value. `PushSubscriptionToggle` only renders once `selected` is non-null —
 * unlike its siblings it has no honest "no address" state, and an
 * `addressId`-less subscription can never be delivered to (ADR 0058). Once
 * selected, it's grouped into the same bordered card as `ScheduleDisplay`
 * (rather than left a disconnected sibling) so the notification opt-in
 * reads as "manage alerts for this collection," not an unrelated control.
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

  const reportedOnboardingRef = useRef(false);

  function handleAddressSelect(address: SuburbSearchResult) {
    writeCachedAddress(address);
    if (!reportedOnboardingRef.current) {
      const { ruleSet } = computeSchedule(address, undefined);
      if (ruleSet !== null) {
        reportedOnboardingRef.current = true;
        reportOnboardingTime(Math.round(performance.now()));
      }
    }
  }

  const schedule = <ScheduleDisplay address={selected} />;

  return (
    <div className="flex w-full max-w-md flex-col items-stretch gap-4">
      <AddressSearch onSelect={handleAddressSelect} />
      <ShiftAlertBanner address={selected} />
      {selected === null ? (
        schedule
      ) : (
        <div className="flex flex-col gap-4 rounded-lg border border-moana/20 p-5">
          {schedule}
          <div className="border-t border-moana/10 pt-4">
            <PushSubscriptionToggle addressId={selected.id} />
          </div>
        </div>
      )}
    </div>
  );
}
