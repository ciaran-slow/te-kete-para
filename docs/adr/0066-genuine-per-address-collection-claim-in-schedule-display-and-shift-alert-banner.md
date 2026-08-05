# ADR 0066: Genuine per-address collection claims in ScheduleDisplay and ShiftAlertBanner

- **Status:** accepted
- **Date:** 2026-08-06
- **Issue:** #134

## Context

ADR 0019 (issue #14) and ADR 0053 (issue #83) both shipped honesty
compromises because nothing in `addresses`/`schedules`/`CollectionRuleSet`
could confirm which calendar weekday a given street is actually collected
on: `<ScheduleDisplay>` showed only *today's* computed rules (not a "next
collection" claim), and `<ShiftAlertBanner>` was worded as a council-wide
policy statement rather than a personal "your collection" claim. Both ADRs
explicitly named the same follow-up trigger: real per-street collection-day
data landing.

Issue #117 (ADR 0063) closed that data gap: `addresses.collection_weekday`
(confirmed per-address via WCC's live per-street lookup tool) plus pure
`isCollectionDay`/`findNextCollectionDate` functions
(`src/lib/schedule/collection-day.ts`). ADR 0063 deliberately stopped at
the data + pure-function layer with zero consumers, naming this issue as
the next step.

## Decision

Thread `collection_weekday` (camelCase `collectionWeekday`) through the
same path `recycling_calendar_group` already follows end-to-end (ADR
0059): `GET /api/suburbs/search`'s row mapping, `SuburbSearchResult` (both
declared copies, ADR 0014), and the `localStorage` address cache (bumping
`ADDRESS_CACHE_VERSION` 2 → 3, ADR 0052's quarantine contract).

`<ScheduleDisplay>` now computes `findNextCollectionDate(classification,
today)` first, then renders `computeCollectionRuleSet` for *that* resolved
date rather than always today — genuinely answering "when's my next
collection and what goes out" (superseding ADR 0019). Heading changes from
"Today's collection" to "Your next collection", covering both the
today-is-your-day and the N-days-away case with one label rather than two,
to keep this single-PR-sized.

`<ShiftAlertBanner>` now only asserts a personal "your collection" claim
when `isCollectionDay` confirms the holiday's original date is genuinely
this address's real collection day (superseding ADR 0053's council-wide
wording). When the address's weekday can't be confirmed (a future
`collection_weekday: null` suburban row — unreachable with today's fully-
confirmed seed data), the banner shows nothing at all rather than falling
back to a generic statement: this is a deliberate simplification (see
Alternatives) to keep the banner strictly personal-claim-only, with no
second wording mode to maintain.

`src/lib/notifications/dispatcher.ts`'s nightly dispatch decision is
explicitly NOT touched by this issue. Filed as its own follow-up: issue
#144. It's a distinct concern from UI consumption (notification
correctness vs. rendered copy), needs its own DB-join plumbing and test
fixtures, and changes production notification behavior — different risk
profile and likely its own ADR, not a same-PR add-on.

## Alternatives considered

### A (chosen): thread `collectionWeekday` through the existing address
pipeline; gate both components on it; show nothing when unconfirmed; defer
the dispatcher to a follow-up issue

- **Pros:** mirrors the already-accepted ADR 0059 threading pattern exactly
  (lower review risk, consistent precedent); keeps both components
  strictly honest (a claim is only ever made when the data backs it up);
  keeps this PR to the two components the issue names, matching "scope it
  to one PR."
- **Cons:** the nightly dispatcher remains ungated for one more issue cycle
  — a suburban subscriber can still get a "collection tomorrow" push on a
  day that isn't really their street's collection day, same as today,
  until #144 lands.

### B: fold the dispatcher gating into this same PR

- **Pros:** closes the whole per-address-claim gap (UI + notifications) in
  one PR, rather than leaving a known gap for a second issue cycle.
- **Cons:** dispatcher.ts's join, its two dependent test files, and its own
  ADR-worthy behavior change roughly double this PR's surface area and mix
  two different risk classes (UI copy vs. who-gets-notified) into one
  review. Rejected: violates "scope it to one PR," and the issue text
  itself invited scoping this out if it was large enough.

### C: fall back to ADR 0053's council-wide wording when `collectionWeekday`
is unconfirmed, instead of showing nothing

- **Pros:** never silently loses a proactive alert just because one
  address's data hasn't been confirmed yet.
- **Cons:** requires keeping two message variants (and their translation
  keys) indefinitely, re-introducing exactly the false-precision-adjacent
  ambiguity this issue exists to remove, just for a narrower audience
  (unconfirmed addresses instead of all of them). Rejected by explicit
  product decision during planning: the banner should be strictly
  personal-claim-only.

### D: keep `<ScheduleDisplay>`'s "Today's collection" framing for a
collection day and add a *second*, differently-worded state for a
non-collection day ("Next collection: ...")

- **Pros:** more precise copy for each case individually.
- **Cons:** doubles the component's rendered states and translation keys
  for marginal clarity gain — a single "Your next collection" label already
  reads correctly whether that date is today or in N days. Rejected to keep
  this a single-PR-sized change; revisit if user feedback says the merged
  framing is confusing.

## Trade-offs and consequences

Ships genuinely honest per-address claims in both components, closing the
gap ADR 0019 and ADR 0053 both named and deferred. Accepts that
`dispatcher.ts` still sends notifications without this same confirmation
for one more issue cycle (#144) — a known, tracked gap, not a silent one.
Accepts a second round of engineer-drafted, fluent-speaker-unreviewed Māori
copy (same open status as ADR 0053/ADR 0038/ADR 0064's existing text).
Revisit trigger: #144 landing should update `docs/architecture.md`'s
Nightly Dispatch Pipeline paragraph and reference this ADR; no further
per-address-claim gaps are expected after that lands, unless a future
issue re-derives collection day from something other than
`addresses.collection_weekday`.
