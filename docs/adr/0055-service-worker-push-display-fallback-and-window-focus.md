# ADR 0055: Service worker push-display fallback and window-focus behaviour

- **Status:** accepted
- **Date:** 2026-08-05
- **Issue:** #115

## Context

#28 sends a VAPID-signed, encrypted Web Push payload
(`{ title, body, collectionDate }`, ADR 0051) to each subscriber's push
service endpoint. `public/sw.js` (ADR 0041) has no `push` or
`notificationclick` listener, so a delivered message today is inert: the
browser has nothing calling `self.registration.showNotification(...)`, and
FR-04's "smart reminder" is not visible end-to-end.

The real `PushEvent`/`PushMessageData` API can legitimately hand the
listener nothing useful to show: `event.data` can be absent (a push service
can deliver a data-less "ping"), and `event.data.json()` itself throws a
`SyntaxError` on a body that isn't valid JSON. A push event handler must
never let either case throw uncaught. Separately, some browsers (Chrome
among them) enforce a "user-visible" contract for the Push API: if a push
event does not result in a shown notification, the browser shows its own
generic replacement notification on the origin's behalf, and repeated
violations can lead to push permission being revoked for that origin. That
makes "silently drop the notification on a parse failure" actively harmful
to FR-04's delivery-success success metric, not merely a worse UX choice.

## Decision

`push` always calls `self.registration.showNotification(...)` exactly once:
with the payload's own `title`/`body` when `event.data.json()` succeeds and
both fields are present as strings, otherwise with a hardcoded generic
English fallback (`"Te Kete Para"` / `"You have a collection reminder — open
the app for details."`). `collectionDate` is parsed but never displayed —
the body already carries the localized bin/time text from
`buildLocalizedPushContent`.

`notificationclick` closes the notification, then focuses the first open
window client (`self.clients.matchAll({ type: "window", includeUncontrolled:
true })`) if one exists, or calls `self.clients.openWindow("/")` if not.

## Alternatives considered

### Silently drop the notification on a malformed/absent payload
- **Pros:** never shows a notification with placeholder/generic content.
- **Cons:** conflicts directly with the browser-enforced "user-visible push"
  contract described above — a swallowed parse error here doesn't just skip
  one reminder, it risks Chrome's automatic generic notification and, on
  repetition, revoked push permission for the origin. Also gives the
  resident no signal at all that a reminder was supposed to arrive.

### Generic fallback notification (chosen)
- **Pros:** `showNotification` is always called exactly once per push event,
  satisfying the browser contract; a resident who gets the rare fallback
  notification still knows to open the app, rather than silently getting
  nothing.
- **Cons:** the fallback text is hardcoded English only — `public/sw.js` has
  no synchronous access to the subscriber's `languagePreference` (that lives
  server-side in `push_subscriptions` and client-side in `localStorage`,
  neither reachable from a `push` event without an extra `clients` round
  trip) — acceptable since this path should be rare (the server always
  sends the ADR 0051 shape) and the real, always-localized content already
  covers FR-04's actual delivery.

### Always open a new window on `notificationclick`
- **Pros:** one line (`self.clients.openWindow("/")`), no `matchAll` needed.
- **Cons:** launches a duplicate tab/window every time a resident taps a
  reminder while the app is already open in another tab — not the "standard
  Notification API pattern" the issue calls for, and a worse experience than
  focusing what's already open.

### Focus existing window, else open one (chosen)
- **Pros:** matches the standard MDN `notificationclick` recipe; no
  duplicate windows when the app is already open.
- **Cons:** slightly more code than the one-liner above.

### `icon`/`badge`/`vibrate` notification options (deferred)
- **Pros:** richer notification presentation.
- **Cons:** no confirmed notification-tray icon asset exists yet (ADR 0041
  covers the manifest/maskable SVGs, not a notification-specific icon), and
  the issue's acceptance criteria don't ask for it. Left for a future issue
  if product wants a richer notification, rather than guessing an asset now.

## Trade-offs and consequences

FR-04's reminder is now visible end-to-end (server dispatch → encrypted
push → this listener → `showNotification`). The accepted gap is the
English-only fallback text on the rare malformed/absent-payload path;
revisit if that path turns out to fire in practice (it would indicate a
real bug in the server-side payload shape, not something this listener
should paper over further).
