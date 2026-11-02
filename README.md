# Te Kete Para (BinSync Wellington)

*Tiakina te taiao, kia mauria te para.* Care for the environment, manage the waste.

A bilingual (English and te reo Māori), mobile-first web app that tells Wellington households when their rubbish and recycling is collected and how to sort what's in the bin. It is an independent prototype and is not affiliated with Wellington City Council.

## What it does

- **Collection schedule:** search for your street or suburb and see your next collection, including the alternating glass-crate and recycling weeks, inner-city night collections, and shifts around public holidays.
- **"He Aha Tēnei?" sorting search:** type or dictate an item (for example "pizza box" or "aerosol can") and get Wellington-specific disposal instructions.
- **Push reminders:** opt in to a night-before web push notification, sent by a nightly job.
- **Bilingual throughout:** a one-tap English / te reo Māori toggle, with a test suite that checks the two languages have the same translation keys.
- **Accessibility first:** semantic landmarks, ARIA live regions, large touch targets and keyboard navigation, checked by automated axe tests in CI.

## Status and honest limits

This is a working prototype, not a finished council tool.

- **Schedules are confirmed for 17 hand-checked streets.** Every other Wellington street and suburb can be found by name, but its collection details are marked "unconfirmed" instead of guessed. No bulk council dataset covers per-street schedules.
- **Sorting rules:** the 15 seeded items were checked against wellington.govt.nz pages.
- **Te reo Māori text has not yet been reviewed by a fluent speaker.**
- **Accessibility is verified by automated tooling only.** It hasn't been tested by people using VoiceOver, TalkBack or NVDA.
- **Weather-shift alerts are not implemented.** There's no structured data source to drive them honestly.

The reasoning behind each of these is recorded in the ADRs (for example 0065, 0074 and 0075).

## Tech stack

| Layer | Tools |
|---|---|
| App | Next.js, React, TypeScript, Tailwind CSS, Radix UI |
| Data | SQLite via Knex.js (migrations and seeds) |
| Notifications | Web Push (VAPID) with a Vercel cron job |
| Testing | Vitest, Testing Library, Playwright, axe-core, Lighthouse CI |
| CI | GitHub Actions: lint, typecheck, tests with a coverage gate, build, accessibility suite, Lighthouse budget |

## How it was built

Built with Claude Code agents under a documented workflow: a vision and PRDs, issue-per-change delivery, and every significant decision recorded as an ADR (77 so far). See [`docs/`](docs/) and [`AGENTS.md`](AGENTS.md).

## Running it locally

```bash
npm install
npm run migrate      # create the SQLite database
npm run seed         # load streets, sorting rules and holidays
npm run dev          # http://localhost:3000
```

Push reminders need these environment variables: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`. Optionally set `DISPATCH_ALERT_WEBHOOK_URL` for failure alerts.

### Scripts

| Command | Purpose |
|---|---|
| `npm test` | Unit and integration tests (Vitest) |
| `npm run test:coverage` | Tests with the coverage gate |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:e2e:a11y` | Automated accessibility suite (axe) |
| `npm run test:lighthouse` | Lighthouse performance and accessibility budget |
| `npm run typecheck` / `npm run lint` | Type and lint checks |
| `npm run migrate:rollback` | Roll back the last migration batch |

## Docs

[Vision](docs/vision.md) · [Architecture](docs/architecture.md) · [PRD 0](docs/prd0.md) · [PRD 1](docs/prd1.md) · [Decision records](docs/adr/)
