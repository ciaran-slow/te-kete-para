/* Pin the suite's time zone away from UTC. CI (ubuntu-latest) runs at
   TZ=UTC, where local-time Date getters (getDay, getFullYear, ...) are
   indistinguishable from their getUTC* twins — so the "UTC calendar date
   only" contract in src/lib/schedule/rules.ts (and any future date code)
   would be unguarded: a getUTC* -> local-getter regression passes under
   UTC and shifts every Wellington collection result by a day in NZDT/NZST.
   Pacific/Auckland is UTC+12/+13, never UTC, so such mutants fail here.
   Must be set before any test imports code that constructs Dates.
   Recorded in ADR 0017 and architecture.md §4 (Suite Time Zone). */
process.env.TZ = "Pacific/Auckland";

import "@testing-library/jest-dom/vitest";
