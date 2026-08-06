# ADR 0070: Use lucide-react for the bin-type icons, not hand-authored inline SVG

- **Status:** accepted
- **Date:** 2026-08-06
- **Issue:** none (raised directly by the user during review)

## Context

PR #171 added a small icon above each "bins to put out" pill in
`ScheduleDisplay` (`src/components/schedule-display.tsx`), following this
repo's only prior icon precedent: `sorting-search.tsx`'s microphone button,
a hand-authored inline `<svg>` with manually-written path data. That
precedent made sense for one icon. For four bin-type glyphs (bag, bottle,
box, recycling symbol), hand-drawing recognizable, visually-consistent
shapes from scratch produces a noticeably lower-polish result than a
maintained icon set — the user asked directly whether a "more modern,
cleaner" library was available instead of the hand-drawn shapes this PR
shipped with.

## Decision

Add `lucide-react` as a dependency and use it for the four bin-type icons
only: `Trash` (yellow-bag-rubbish), `BottleWine` (glass-recycling),
`Recycle` (mixed-recycling), `Package` (cardboard). `sorting-search.tsx`'s
existing mic icon is untouched — this is not a repo-wide icon-library
migration, just the one component this request was about.

`BIN_TYPE_ICON_COLOR_CLASS` (added in #171) is unchanged: lucide icons are
stroke-based (`stroke="currentColor"`, `fill="none"` by default) rather
than the fill-based hand-drawn shapes they replace, but `currentColor`
resolves from the same `text-kowhai`/`text-moana` Tailwind class either
way, so the colour-independent-from-pill-text-colour design (kōwhai icon
on a dark-text pill, for contrast reasons recorded in #171) carries over
unchanged.

## Alternatives considered

### A: Keep hand-authored inline SVG (status quo)
- **Pros:** zero new dependency; full control over exact path data; matches
  `sorting-search.tsx`'s one existing icon.
- **Cons:** visibly lower polish for four icons than a maintained set;
  every future icon need re-litigates the same hand-drawing effort; the
  user explicitly asked for something cleaner.

### B: @radix-ui/react-icons
- **Pros:** this app already depends on `radix-ui` for `Switch`/`RadioGroup`/
  `Separator` — using the matching icon set would need no new dependency
  root, just a sibling package from the same project.
- **Cons:** Radix Icons is a small, UI-chrome-focused set (arrows, chevrons,
  common interface glyphs) — it has no bottle, bag, box, or recycling-symbol
  icon. Wrong tool for object/concept icons, regardless of the naming
  synergy.

### C (chosen): lucide-react
- **Pros:** actively maintained fork/successor of Feather Icons, the de
  facto default icon set in the current Next.js/Tailwind/shadcn ecosystem;
  tree-shakeable (each icon is its own module — only the four imported here
  end up in the bundle, confirmed via `lucide-react`'s zero runtime
  dependencies, `package.json` peer-deps only on `react`); has literal,
  recognizable icons for all four concepts needed here (`Trash`,
  `BottleWine`, `Recycle`, `Package`) without needing a custom-drawn glyph.
- **Cons:** a new dependency to track for updates; the four icons' visual
  style (line-art, rounded joins) is a small step away from this app's
  otherwise solid-fill visual language (Radix primitives, flat colour
  blocks) — accepted as a minor, deliberate style note rather than a defect.

## Trade-offs and consequences

`BinTypeIcon` (the hand-authored switch component #171 added) is deleted
entirely, replaced by a plain `Record<WasteBinType, LucideIcon>` lookup —
simpler than the component it replaces, since lucide icons are already
components, not cases needing a manual switch. Any future bin type
(`WasteBinType` growing a new member) needs a new lucide icon picked and
added to that map — a much smaller lift than hand-drawing a new glyph from
scratch, which was the whole point of this change.
