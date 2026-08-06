# ADR 0069: Merge "general-rubbish" into "yellow-bag-rubbish" — WCC's official bag is the same container everywhere

- **Status:** accepted
- **Date:** 2026-08-06
- **Issue:** none (raised directly by a Wellington-resident user during review)

## Context

`computeCollectionRuleSet` (`src/lib/schedule/rules.ts`) modelled suburban
rubbish and inner-city rubbish as two distinct `WasteBinType`s:
`"general-rubbish"` for suburban kerbside, `"yellow-bag-rubbish"` for
inner-city night collection — implying two different containers, one a
wheelie bin, the other literally a yellow bag.

That distinction is wrong. WCC's official rubbish bag — sold in
supermarkets as "Wellington City Council Yellow Rubbish Bags" — is the
general rubbish container city-wide. There is no wheelie-bin option for
general household rubbish anywhere in Wellington; council wheelie bins are
for recycling (paper/cans/plastic), a separate concept this app already
models correctly as `"glass-recycling"`/`"mixed-recycling"`. This app's own
`vision.md` §1 already said as much — "suburban yellow bags... inner-city
night collections (yellow bags out between 5:30 PM and 10:00 PM)" — the
code just never matched it. The two-bin-type split was an implementation
artifact introduced when `rules.ts` was first written from the vision doc,
not a deliberate decision recorded in any prior ADR: nothing in this repo's
ADR history establishes `"general-rubbish"` as an intentional real-world
distinction.

The practical harm: a real Wellington resident using this app would see
"General rubbish" for their suburban address and reasonably read that as
"any rubbish container is fine" or "a wheelie bin is provided" — neither is
true. Every suburban resident still needs to buy and use the same official
yellow bags as an inner-city resident; only their collection day/time and
accompanying recycling items differ.

## Decision

Remove `"general-rubbish"` from the `WasteBinType` union entirely.
`computeCollectionRuleSet`'s suburban branch now pushes
`"yellow-bag-rubbish"` — the same value the inner-city branch already used —
as the first bin type. The two collection types remain genuinely distinct
in every way that's real: `timeWindow` (07:00 kerbside vs. 17:30–22:00
night), and the accompanying items (alternating glass/mixed recycling vs.
Tuesday cardboard). Only the rubbish container itself, which was never
actually different, stops being modelled as if it were.

Removed the now-dead `schedule.binType.generalRubbish` dictionary key (both
locales) rather than leaving it unreferenced — this repo's convention is no
orphaned translation keys. Every consumer of the old
`Record<WasteBinType, ...>` shape (`schedule-display.tsx`'s
`BIN_TYPE_KEYS`/`BIN_TYPE_PILL_CLASS`, `payload-builder.ts`'s own
`BIN_TYPE_KEYS`) had its `"general-rubbish"` entry deleted; TypeScript's
excess-property check on the narrowed `WasteBinType` union caught every
call site mechanically — no `grep`-only cleanup relied on for code (docs
and test fixtures still needed a manual pass, since string literals in
`.test.ts` files aren't type-checked against `WasteBinType`).

One incidental effect: `schedule-display.tsx`'s per-bin-type pill styling
(kōwhai theming only for `"yellow-bag-rubbish"`, added for the
visual-hierarchy cleanup just before this) now applies uniformly to every
address's rubbish item, suburban and inner-city alike — which is the
correct outcome, not a regression: it's the same real container both
places.

## Alternatives considered

### A: Keep both bin types, just re-map suburban's display text to say "Yellow rubbish bag" too
- **Pros:** smaller diff; `WasteBinType` union unchanged.
- **Cons:** leaves two enum values representing one real-world concept —
  exactly the kind of duplicate-source-of-truth this repo's `WasteBinType`
  design otherwise avoids (compare `RecyclingCalendarGroup`, `TimeWindow`:
  one value per real distinction). A future reader of `rules.ts` would still
  see `"general-rubbish"` and `"yellow-bag-rubbish"` as if they meant
  different things, reintroducing the same misunderstanding this ADR fixes.

### B (chosen): Delete "general-rubbish", use "yellow-bag-rubbish" for both
- **Pros:** `WasteBinType` now has exactly one value per real container;
  TypeScript enforces every consumer stays in sync; matches `vision.md`'s
  own (already-correct) description.
- **Cons:** touches more files (dictionaries, two `BIN_TYPE_KEYS` maps, test
  fixtures in `rules.test.ts`, `schedule-display.test.tsx`,
  `address-schedule.test.tsx`, `payload-builder.test.ts`) — all mechanical
  renames, not new logic.

## Trade-offs and consequences

Every UI surface, push-notification body, and test fixture now says "Yellow
rubbish bag" / "Pēke Kōwhai Para" for suburban rubbish, matching the real
WCC system. The manual screen-reader accessibility-tree snapshots
(`e2e/manual-screen-reader-tree.spec.ts-snapshots/*.aria.yml`, ADR 0024 —
excluded from CI, so this wasn't caught by any required check) were
regenerated; they turned out to have been stale since the homepage
diagnostic cleanup that preceded this change too, not only for this rename.

`docs/prd1.md` — an uncommitted, not-yet-reviewed working draft, not part of
this PR's diff or any commit — cited `Para Whānui` as an example of a real
(non-placeholder) Te Reo translation present in the dictionary; that local
file was updated to cite `Pēke Kōwhai Para` instead, since `Para Whānui` — the
Māori value that key held — no longer exists anywhere in the app. Whoever
next commits that document should carry this correction forward.
`vision.md`'s own glossary still lists `Para Whānui (General Refuse)` as a
general vocabulary term; that entry is left as-is, since it documents Te Reo
vocabulary broadly rather than this specific (now-removed) schedule label,
and nothing in this ADR establishes it as wrong the way the bin-type split
was.
