# ADR 0047: Treat the VAPID public key as a documented config gap, not a provisioned secret

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #26

## Context

`pushManager.subscribe()` requires a real `applicationServerKey` (a VAPID
public key) or it rejects. No VAPID keypair, env var convention, or
`.env.example` exists anywhere in this repo — checked `.env.example`
(absent), `next.config.ts`, `knexfile.js`, and every open Night-Before
Push Notifications issue (#25 closed with no mention of key generation;
#27 nightly cron dispatcher and #28 bilingual payload delivery, both
open, will need the *private* half server-side, but neither issue says
so explicitly yet). This PR's job (#26) is the opt-in toggle; it only
ever needs the *public* half, client-side.

## Decision

The component reads `process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY` at the
point of use (not cached in a module-level constant, so it's testable
per-test via `vi.stubEnv` and matches how Next.js's build-time inlining
of `NEXT_PUBLIC_*` actually works — the reference must appear at the
site Next.js rewrites). `parseVapidPublicKey()`
(`src/components/push-subscription-toggle.tsx`) validates it — non-empty,
valid base64url, decodes to exactly 65 bytes (the fixed length of an
uncompressed P-256 point) — and a failure renders a first-class
"misconfigured" UI state rather than throwing. No real keypair is
generated, and no `.env.example` is added in this PR — this repo's
`.gitignore` blanket-excludes `.env*`, and there's no existing env var to
model a convention on yet. The env var name and a generation command
(`npx web-push generate-vapid-keys`, or Node's own
`crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" })` — no new
dependency required to *generate* one, only if a project chooses the
`web-push` CLI for convenience) are recorded here so #27/#28 or a future
deploy-setup issue know where to look for the private-key counterpart
this PR does not create.

## Alternatives considered

### A. Generate and commit a real dev keypair now
- **Pros:** the toggle is fully live end-to-end in every environment
  immediately, including a fresh clone.
- **Cons:** a VAPID private key is a secret; committing one — even a
  "dev-only" one — normalizes committing secrets and this repo's
  `.gitignore` already treats `.env*` as the place secrets don't get
  committed. Nothing server-side consumes the private key yet (#27/#28
  are both open), so there's no code path to even exercise it.

### B. Treat as a documented config gap (chosen)
- **Pros:** no secret enters the repo; the component fails safe
  ("misconfigured") instead of crashing when unset, in every environment
  including CI; the fix, when it happens, is a deploy-config change with
  zero code changes.
- **Cons:** the toggle shows "misconfigured" in every environment,
  including local dev, until someone sets the env var — a real person
  has to know to do that. Mitigated by this ADR being the place that
  says so, plus the "misconfigured" copy itself telling a developer
  something is missing rather than silently doing nothing.

### C. Block #26 entirely until VAPID keys are provisioned
- **Pros:** avoids ever shipping a "misconfigured" state.
- **Cons:** contradicts being handed #26 to plan/build now; the
  component's own tests need no real key (they stub
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` directly), so there's no actual
  blocker to building and testing it today.

## Trade-offs and consequences

Every environment that doesn't set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` shows
"misconfigured" — that includes this PR's own CI run and local dev by
default. Revisit trigger: whichever of #27/#28 first needs the matching
private key server-side should generate the real pair then (or a
dedicated deploy-setup issue, if one exists first) and set both halves
in the relevant environment(s).
