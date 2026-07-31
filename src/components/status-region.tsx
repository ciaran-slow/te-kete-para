/**
 * Shared aria-live announcement wrapper (FR-03, vision.md §3, ADR 0021,
 * issue #16). Wraps dynamic status content — today's collection rules
 * (`ScheduleDisplay`), the address search status message
 * (`AddressSearch`) — in a `polite` live region so assistive technology
 * announces the change without each caller re-deriving the ARIA plumbing.
 * It renders only the wrapping element and forwards `children` as-is; it
 * owns no state and computes nothing.
 */
"use client";

import type { ReactNode } from "react";

export interface StatusRegionProps {
  /**
   * Host element to render. Callers choose it explicitly — this component
   * never defaults to a specific semantic meaning silently. See ADR 0021
   * for why "section" and "p" are the two shapes needed today.
   */
  as?: "section" | "p" | "div";
  /**
   * Sets `aria-atomic="true"` when true. Omitted (default false) leaves
   * `aria-atomic` off the element entirely — matching this repo's existing
   * `AddressSearch` status paragraph, which never set it. Pass `true` for
   * regions (like `ScheduleDisplay`) where a change to any part of the
   * content should be read as a whole.
   */
  atomic?: boolean;
  /**
   * id of the heading that labels this region's content, when one is
   * currently rendered. Sets `aria-labelledby`. Omit (never pass an id
   * pointing at nothing) when no such heading exists in the current
   * render — see `ScheduleDisplay`'s empty/error states.
   */
  headingId?: string;
  className?: string;
  /**
   * Optional (not required) so a region can render empty — e.g. an
   * "idle" status with no current message — while keeping the live
   * region mounted. Remounting the element on every message would defeat
   * `aria-live` announcement entirely.
   */
  children?: ReactNode;
}

export function StatusRegion({
  as: Tag = "div",
  atomic = false,
  headingId,
  className,
  children,
}: StatusRegionProps) {
  return (
    <Tag
      aria-live="polite"
      aria-atomic={atomic ? "true" : undefined}
      aria-labelledby={headingId}
      className={className}
    >
      {children}
    </Tag>
  );
}
