"use client";

import { useState } from "react";
import {
  AddressSearch,
  type SuburbSearchResult,
} from "@/components/address-search";
import { ScheduleDisplay } from "@/components/schedule-display";

/**
 * Page-specific composition, colocated with (not exported from) page.tsx —
 * same convention as home-copy.tsx (ADR 0011). Owns the one piece of state
 * `AddressSearch` and `ScheduleDisplay` must share: which address is
 * currently selected. `selected` starts `null` identically on the server
 * and the client, and can only change via `AddressSearch`'s `onSelect`
 * callback, which only fires from a DOM event handler — see ADR 0018 for
 * why this matters.
 */
export function AddressSchedule() {
  const [selected, setSelected] = useState<SuburbSearchResult | null>(null);

  return (
    <div className="flex w-full max-w-md flex-col items-stretch gap-4">
      <AddressSearch onSelect={setSelected} />
      <ScheduleDisplay address={selected} />
    </div>
  );
}
