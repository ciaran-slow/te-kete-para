# Architecture: Te Kete Para (BinSync Wellington)

---

## 1. System Overview & Architecture Style
**Te Kete Para** is structured as a modular, high-performance **Progressive Web Application (PWA)** built on a Jamstack/Server-Side Rendering (SSR) hybrid model. It cleanly separates client-side presentation layers from an edge-optimized API backend and an embedded relational database.

[ Client PWA (Next.js / Tailwind / Radix UI / Vitest) ]
│  (HTTPS / REST / Web Push)
▼
[ Vercel Edge / Serverless API Layer (Node.js) ]
│  (Knex.js Query Builder)
▼
[ SQLite3 Database (WCC Schedules, Localizations, Users) ]

---

## 2. Component Breakdown & TDD Testing Strategy

### A. Client-Side Layer (Frontend PWA)
* **Framework:** Next.js (React) utilizing App Router for file-system routing and static/dynamic rendering optimization.
* **Styling & Design System:** Tailwind CSS configured with Wellington design tokens (`#1B4D3E` Kākāriki, `#003B46` Moana, `#B45309` Kōwhai, `#F8FAFC` Papa).
* **Accessibility Primitives:** Radix UI headless components ensuring W3C ARIA compliance, keyboard navigation, and screen-reader optimization.
* **Localization State:** React Context (`LanguageContext`) supporting full app translation and macron-safe rendering via **Inter** and **Plus Jakarta Sans**.
* **Client Testing Strategy (Vitest + Testing Library + Axe):**
  * Unit tests verify bilingual UI component rendering, dictionary interpolation, and macron preservation.
  * Automated accessibility test suites (`@axe-core/react`) run inside Vitest to instantly catch contrast, ARIA, and focus-ring regressions.

### B. API & Business Logic Layer
* **Runtime Environment:** Node.js serverless functions / edge runtimes hosted via Vercel or Netlify.
* **Data Abstraction:** **Knex.js** query builder managing secure, parameterized SQL query generation and automated schema migrations.
* **API Testing Strategy (Vitest + Supertest):**
  * Integration test suites spin up in-memory SQLite3 instances running real Knex migrations.
  * Supertest validates mock endpoint behaviors (`/api/suburbs/search`, `/api/notifications/subscribe`) to ensure correct schedule math, holiday overrides, and JSON payloads.

### C. Data Persistence Layer
* **Database Engine:** **SQLite3** stored as an embedded file database (`/data/teketepara.db`).
* **Core Schemas:**
  * `addresses`: Wellington street indices, council zones, suburb classifications (Suburban vs. CBD night collection).
  * `schedules`: Date-mapped bin collection calendars, alternating recycling flags, and holiday override rules.
  * `i18n_strings`: Relational translation keys with explicit English (`en`) and Te Reo Māori (`mi`) text columns.
  * `sorting_rules`: Item keys, bilingual descriptions, and WCC disposal instructions.
  * `users` & `push_subscriptions`: User preferences, language toggles, address foreign keys, and Web Push tokens.
  * *Database Testing:* Vitest verifies migration up/down cycles against clean test databases before test execution.

---

## 3. Data Flow & Request Lifecycle

1. **Address Lookup & Initialization:**
   * User inputs street address in the PWA client.
   * Client sends a GET request to `/api/suburbs/search?q=TeAro`.
   * API queries SQLite3 via Knex, returning matching zones, collection rules, and inner-city night collection flags.
2. **Schedule Rendering & Localization:**
   * Client renders upcoming bin requirements using localized templates, validated via component and key-parity tests.
3. **Notification Scheduling & TDD Verification:**
   * User opts into "Night-Before" reminders via browser Service Worker.
   * Server stores subscription tokens in SQLite3. Cron workers execute nightly at 6:00 PM NZST, evaluating timezones and dispatching bilingual payloads to the Web Push API.

---

## 4. Testing Infrastructure & Quality Assurance Pipelines
* **Execution Engine:** **Vitest** configured for fast parallel execution across client unit tests, accessibility hooks, and API integration suites.
* **Coverage Enforcement:** Continuous integration pipelines fail builds if test code coverage drops below **90%**.
* **Automated Linting & Type Safety:** TypeScript strict mode enabled across the entire codebase to prevent runtime type errors and ensure bulletproof database entity mapping.