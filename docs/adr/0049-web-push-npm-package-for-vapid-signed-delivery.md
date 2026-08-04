# ADR 0049: `web-push` npm package for VAPID-signed Web Push delivery

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #28

## Context

Actually sending a Web Push message requires two RFC-specified mechanisms
this repo has no code for yet: RFC 8292 (a VAPID JWT, ES256-signed with the
private key, sent as an `Authorization` header) and RFC 8291 (encrypting the
payload to the subscriber's `p256dh`/`auth` keys via ECDH + HKDF +
AES-128-GCM, `Content-Encoding: aes128gcm`). No dependency in `package.json`
does either today. `architecture.md` §3 names "dispatching bilingual
payloads to the Web Push API" as the nightly cron's job but does not pick an
implementation.

## Decision

Add `web-push` (plus `@types/web-push` as a dev dependency, since this
package ships no bundled types and the repo runs `strict` TypeScript) as a
production dependency. `src/lib/notifications/push-sender.ts` calls
`webpush.setVapidDetails(subject, publicKey, privateKey)` once per send and
`webpush.sendNotification(subscription, payloadString)`.

## Alternatives considered

### `web-push` npm package (chosen)
- **Pros:** implements exactly the RFC 8291/8292 combination this feature
  needs, purpose-built and widely used for this exact task; small dependency
  footprint (~48KB unpacked, four small transitive deps: `asn1.js`,
  `http_ece`, `https-proxy-agent`, `jws`); runs under this fork's default
  Node.js route runtime (`node_modules/next/dist/docs/.../runtime.md` —
  `'nodejs'` is the default, and this PR adds no route at all, per ADR 0044's
  already-decided invocation-wiring deferral to #110).
- **Cons:** a new dependency and its transitive tree; `@types/web-push`'s
  latest published version (3.6.4) trails the runtime package's latest
  (3.6.7) slightly — accepted, since `setVapidDetails`/`sendNotification`'s
  signatures have been stable across that range.

### Hand-rolled VAPID JWT + aes128gcm encryption via Node's `crypto`/`webcrypto`
- **Pros:** zero new dependency, in keeping with this repo's general
  preference (e.g. ADR 0041's hand-rolled service worker over Workbox).
- **Cons:** RFC 8291's payload encryption (ECDH key agreement, HKDF context
  derivation, AES-128-GCM with the spec's specific padding) is a materially
  larger and higher-stakes crypto implementation surface than ADR 0041's
  ~30-line precache script — a subtly wrong implementation fails silently
  (the push service or browser just drops/can't-decrypt the message) rather
  than throwing, and there's no existing crypto-utility precedent in this
  repo to build it on.

### A hosted push-delivery service (e.g. Firebase Cloud Messaging's web push bridge)
- **Pros:** offloads encryption and delivery entirely to a managed service.
- **Cons:** introduces an external account/service dependency and SDK,
  contradicts `architecture.md`'s framing of talking to "the Web Push API"
  directly, and is a bigger architectural shift than this issue's scope.

## Trade-offs and consequences

Takes a dependency on `web-push`'s maintenance and its transitive tree.
Revisit only if that maintenance lapses or a lighter purpose-built
alternative for the same RFC pair emerges.
