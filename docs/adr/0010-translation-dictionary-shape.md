# ADR 0010: Flat dictionaries with en as the typed source of truth

- **Status:** accepted
- **Date:** 2026-07-30
- **Issue:** #7

## Context

FR-01 requires 100% key parity between the English and Te Reo Māori
dictionaries, asserted by a unit test. #7 must therefore fix both the shape the
dictionaries take and the mechanism that enforces parity, because every later
i18n issue (#8 toggle, #9 macron audit, #28 bilingual push payloads, #20
sorting search) reads whatever this issue establishes.

The repo already gates `tsc --noEmit` and a 90% coverage threshold in CI (ADR
0008, #45), which changes what "enforced" can mean: a relationship expressible
in the type system is enforced earlier and more cheaply than one checked at
runtime.

## Decision

Flat, dot-delimited string keys. `src/lib/i18n/dictionaries.ts` declares `en`
`as const` as the source of truth, derives `export type TranslationKey = keyof
typeof en`, and annotates `mi` as `Record<TranslationKey, string>`. A runtime
detector `findKeyParityGaps` lives in `__tests__/helpers/i18n.ts` and is
unit-tested against deliberately mismatched fixtures as well as applied to the
real dictionaries. `t()` performs a direct lookup with no fallback chain.

## Alternatives considered

### Flat keys, en as typed source of truth (chosen)

- **Pros:** drift fails `tsc` in both directions — a missing `mi` key is
  `TS2741`, an extra one is `TS2353` (both verified) — so it is caught at
  typecheck rather than only in a test run; dot-delimited flat keys are greppable,
  which matters when auditing that every visible string is translated; a single
  source of truth means adding a key is a compile error until it is translated,
  making the gap impossible to forget; and the runtime detector still covers the
  cases types cannot, namely dictionaries loaded from the `i18n_strings` table
  later and drift smuggled in via a cast.
- **Cons:** it makes FR-01's required runtime test belt-and-braces rather than
  the primary gate, which is only honest to state outright; a naive version of
  that test would be untriggerable and therefore decorative, so it has to be
  built as a separately-tested detector plus an application of it; and English is
  structurally privileged as the language keys are defined in, which sits a
  little awkwardly with a genuinely bilingual product even though it is only a
  type-level relationship.

### Nested dictionary objects

- **Pros:** groups related strings and reads more naturally for deep UI trees;
  shorter leaf names.
- **Cons:** parity checking needs recursive traversal, so the detector grows the
  bug surface it exists to prevent; keys are no longer greppable as whole
  strings, which weakens the "is everything translated?" audit; and `keyof` no
  longer yields the key set, so the compile-time parity guarantee is lost or
  needs elaborate recursive types.

### Both dictionaries independently typed as Record<string, string>

- **Pros:** neither language is privileged; the runtime parity test becomes the
  single, genuinely load-bearing gate, which is arguably a truer reading of
  FR-01.
- **Cons:** `t("typo.key")` compiles and fails at runtime, so a missing key
  reaches the user instead of the build; drift is caught only when tests run
  rather than at typecheck; and it deliberately discards a guarantee the compiler
  will give for free.

### A translation library (next-intl, react-i18next)

- **Pros:** interpolation, pluralisation and locale-aware formatting solved;
  parity tooling often included.
- **Cons:** a new runtime dependency needing its own ADR and bundle-size
  justification for a seven-key dictionary; most assume locale-prefixed routing,
  which FR-01 explicitly does not want; and the pluralisation rules that justify
  such a library are not yet needed anywhere in the PRD.

## Trade-offs and consequences

Adding a UI string becomes a typecheck error until both languages have it, which
is the strongest available enforcement of FR-01's parity requirement and it costs
nothing at runtime. Keys stay greppable, so "find every user-visible string" is a
text search.

Accepted knowingly: the runtime parity test is redundant for the static
dictionaries. It is kept because FR-01 names it, because it is the only mechanism
that will work for database-loaded strings, and because its detector is
independently tested so it is provably functional rather than ornamental. Also
accepted: `t()` has no fallback, so this design relies on the type system being
told the truth — a cast that widens `mi` would defeat it, and the runtime test is
the backstop for precisely that.

The English-as-source-of-truth asymmetry is a type-level artefact, not a product
statement, but it is worth naming: keys are named in English and a translator
works against an English list.

Revisit when strings start coming from `i18n_strings` (the compile-time
relationship disappears and the runtime test becomes the primary gate), when
interpolation or pluralisation is first needed (reconsider a library, and note
`t()` currently takes no parameters), or if a third language is added — at which
point `Record<Locale, Record<TranslationKey, string>>` scales but the
`LOCALES` tuple and the parity test's pairwise shape both need revisiting.
