# ADR 0052: localStorage-cached selected address, restored via useSyncExternalStore, for offline schedule rendering

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #30

## Context

NFR-02 requires that a user-selected address's schedule still renders when
the device is offline — the scenario named explicitly is a mobile-coverage
drop in Wellington's topography, which is at least as likely to mean "the
user reopens the app with no signal" as "the network drops mid-session."
`public/sw.js`'s existing precache (ADR 0041, issue #29) covers only five
fixed-path shell assets and deliberately stops there; it has no logic for
caching a specific API response tied to user selection, and
`docs/architecture.md` flagged this as a separate, still-undecided piece of
NFR-02 tracked by this issue.

`<ScheduleDisplay>` (issue #14, ADR 0015/0018/0019) needs only two inputs to
render: a `ZoneClassification` (`{ zone, isInnerCityNightCollection }`,
carried on the `SuburbSearchResult` the user selected via `<AddressSearch>`)
and "today," which is always read from the viewer's own device clock,
client-side, and is never fetched over the network (ADR 0018). So the only
thing that actually needs to survive offline is the previously-selected
`SuburbSearchResult` itself — a single small object, not a growing or
queryable collection.

`AddressSchedule` (`src/app/address-schedule.tsx`) currently holds
`selected` in a plain `useState<SuburbSearchResult | null>(null)`, which does
not survive a reload. ADR 0018 established that `selected` must start `null`
identically on the server and the client's first render, and — as written —
can only become non-null via a DOM event handler, specifically so
`ScheduleDisplay`'s "today" computation never runs anywhere but a
provably-client-only render path.

## Decision

Cache the selected `SuburbSearchResult` in `localStorage` under
`tkp.selectedAddress`, as a versioned JSON payload (`{ version: 1, address
}`), read back via `useSyncExternalStore` — the same pattern
`src/lib/i18n/locale-storage.ts` established for the persisted locale (ADR
0009). `src/lib/schedule/address-cache.ts` exports `readCachedAddressRaw` /
`getServerCachedAddressRaw` (always `null`) / `writeCachedAddress` /
`subscribeToCachedAddress`, plus a pure `parseCachedAddress(raw)` that
validates the version and shape and returns `null` for anything else.
`AddressSchedule` replaces its `useState` with `useSyncExternalStore` over
the raw stored string, derives the parsed address via `useMemo`, and wires
`AddressSearch`'s `onSelect` directly to `writeCachedAddress`.

This gives `selected` a second way to become non-null beyond a direct
`onSelect` event: restoration from a prior visit, synchronized post-hydration
via `useSyncExternalStore`'s own mechanism for values that differ between
server and client. This still satisfies ADR 0018's actual safety property
(not just its literal wording) — `getServerCachedAddressRaw` always returns
`null`, so SSR output and the client's first hydration pass both show "no
address selected," identically to today; the real cached value only takes
effect in a client-only re-render after hydration commits, the same
mechanism ADR 0009 already relies on for the locale flash. No render path
gains the ability to show computed schedule content during SSR. ADR 0018 is
not superseded — its reasoning is reaffirmed, extended to cover this second
path explicitly rather than leaving it to a future reader to re-derive.

## Alternatives considered

### Storage mechanism

#### `localStorage` via `useSyncExternalStore` (chosen)
- **Pros:** direct precedent already in this codebase (ADR 0009) for
  exactly this shape of problem — small client-only state that must survive
  reload and agree with SSR on first paint; synchronous read, so no loading
  state or extra render pass is needed the way an async store would require;
  zero new dependencies; trivially unit-testable in jsdom (`vitest.setup.ts`
  already runs under jsdom with a real `Storage` implementation).
- **Cons:** `localStorage` is synchronous and blocks the main thread on
  read/write, and has no structured-query capability — both irrelevant here
  since the payload is a single small object read/written as a whole, never
  queried.

#### IndexedDB
- **Pros:** async (never blocks the main thread), handles much larger or
  more structured data well, has a real query/index model.
- **Cons:** every one of those strengths solves a problem this issue doesn't
  have — one small JSON object, not a growing structured dataset. Its async
  API would force either a loading/skeleton state in `ScheduleDisplay` for
  the single frame before the read resolves, or a second `useState` +
  `useEffect` populated after an async read — the latter is the exact
  `react-hooks/set-state-in-effect`-shaped pattern ADR 0009 already rejected
  for this same class of problem, and re-litigating it here for a strictly
  smaller/simpler payload than the locale case has no justification. No
  existing precedent in this codebase.

#### Extend `public/sw.js`'s cache to intercept/store `GET /api/suburbs/search`
- **Pros:** keeps all offline-caching logic in one place (the service
  worker); the browser handles cache storage rather than the app.
- **Cons:** wrong shape for what's needed. `/api/suburbs/search?q=` is
  queried per keystroke with an arbitrary, unbounded set of `q` values
  (`address-search.tsx`'s 300ms-debounced search) — caching "the response"
  really means caching one specific query string's result set, most of which
  (every non-selected match) is irrelevant to what needs to survive offline.
  The service worker has no concept of "which result the user selected" at
  all — that's UI state, not a fetch it can see or intercept. Making it
  cache-aware of selection would mean the service worker either caches every
  search response speculatively (unbounded growth, most of it never needed
  offline) or the page would have to explicitly message the service worker
  which response to keep — materially more complex than a `localStorage`
  write, for the same one-object result. Also outside `public/sw.js`'s
  established scope (ADR 0041: five fixed shell-asset paths, deliberately
  not extended to dynamic API responses).

### Cached data shape

#### The selected `SuburbSearchResult` object (chosen)
- **Pros:** exactly the input `computeCollectionRuleSet` needs
  (`{ zone, isInnerCityNightCollection }`), plus the fields
  (`streetName`/`suburb`/`id`) needed to keep showing which address the
  schedule belongs to; tiny (well under 200 bytes serialized); "today" is
  always known from the viewer's own clock (ADR 0018), so nothing else needs
  to be cached or recomputed to render offline.
- **Cons:** none identified specific to this shape — it's the minimal input
  the render path actually requires.

#### The raw `GET /api/suburbs/search` response
- **Pros:** would require no new parsing of "which result was selected" if
  the whole response were cached wholesale.
- **Cons:** the response is `{ results: SuburbSearchResult[] }` for one
  arbitrary query string — it can contain zero, one, or many results, only
  one of which (if any) is the address the user actually selected. Caching
  it doesn't identify a selection at all; a separate mechanism would still
  be needed to record which of the N results was chosen, at which point the
  cached response's other N-1 entries are dead weight. Strictly more data
  than needed for strictly less clarity.

#### `ScheduleDisplay`'s computed rule set / rendered props
- **Pros:** would let an offline render skip recomputation entirely.
- **Cons:** `computeCollectionRuleSet` is a pure, cheap, synchronous function
  of `(zone classification, today)` (ADR 0015) — there is no expensive or
  network-dependent step to precompute and cache. Worse, caching the
  *computed* result would freeze it to whatever date it was computed on: a
  user who goes offline on Monday and reopens the app offline on Wednesday
  must still see Wednesday's bins, not a stale Monday snapshot. Caching the
  zone classification and always recomputing against the real current date
  is what makes that correct; caching the computed output would silently
  reintroduce staleness that caching the classification avoids for free.

## Trade-offs and consequences

The selected address's zone classification survives reload and offline
relaunch with no new dependency, no async loading state, and no change to
`public/sw.js`'s scope. The cost: no expiry/TTL on the cached address (a
zone's classification changes rarely, if ever, and the issue's acceptance
criteria only require offline rendering of the last selection, not staleness
invalidation) — revisit if a future requirement needs the cache to expire or
invalidate on a schema change beyond the `version` bump already handled.
`AddressSchedule`'s `selected` state can now become non-null through a
second path beyond a direct `onSelect` event (restoration from storage,
ADR 0018 §Decision above) — safe under the same reasoning ADR 0018 already
established, but a future change to `AddressSchedule` must keep that
restoration client-only (i.e. never feed a non-`null` value into
`getServerCachedAddressRaw`) or ADR 0018's hazard becomes real.
