# Product Requirements Document (PRD v0.2): Te Kete Para

---

## 1. Product Overview & Objectives
* **Product Name:** Te Kete Para (BinSync Wellington)
* **Goal:** Deliver a fast, fully accessible, bilingual (English / Te Reo Māori) web application that eliminates rubbish and recycling collection confusion for Wellington City Council (WCC) residents.
* **Success Metrics:** 
  * Zero-friction onboarding (<30 seconds to find schedule).
  * 90%+ push notification delivery success rate.
  * 100% pass rate on automated WCAG 2.2 AAA checks (axe-core); no independent human-operated assistive-technology audit for this prototype (ADR 0065).
  * **>90% test code coverage** enforced via Vitest.

---

## 2. User Personas
1. **The Accessible Household Resident:** Relies heavily on screen readers (VoiceOver/TalkBack) or high-contrast visual settings to manage weekly chores independently.
2. **The Inner-City Apartment Flatmate:** Subject to complex Wellington CBD night-collection windows (5:30 PM – 10:00 PM) who needs precise evening timing alerts.
3. **The Eco-Conscious Reo Speaker:** Prefers navigating public utilities entirely in Te Reo Māori and values accurate guidance on local recycling rules to prevent bin contamination.

---

## 3. Functional Requirements & TDD Specifications (MVP Scope)

### FR-01: Full-App Bilingual Interface & Macron Support
* **Requirement:** The UI must feature a prominent, accessible language toggle (`EN` | **Te Reo**) in the header. Every element of the user journey—from dynamic states and error messages to push notifications—must be fully translated. All typography must utilize **Inter** and **Plus Jakarta Sans** to natively render macrons (`ā`, `ē`, `ī`, `ō`, `ū`) without font fallback glitches.
* **TDD Strategy:** 
  * Unit tests assert that translation dictionaries achieve 100% key parity between English and Te Reo Māori.
  * Component tests mount views in both languages, verifying valid DOM rendering of diacritical marks and accessibility attributes (`aria-label`).

### FR-02: Address & Collection Zone Finder
* **Requirement:** Users must be able to search their Wellington street address to automatically retrieve their specific collection calendar (suburban kerbside rules vs. inner-city CBD night collection rules).
* **TDD Strategy:** 
  * Integration tests using Vitest and Supertest verify that `/api/suburbs/search` returns exact zone matches and handles edge cases (typos, partial street names) against an in-memory SQLite3 database via Knex.js.

### FR-03: WCAG 2.2 AAA Accessibility Compliance
* **Requirement:** All components must adhere strictly to WCAG 2.2 AAA guidelines, as verified by automated tooling. A human-operated screen-reader audit (VoiceOver/TalkBack/NVDA/JAWS) is out of scope for this prototype release (ADR 0065) — see docs/vision.md §3.
* **TDD Strategy:** 
  * Automated accessibility testing via `@axe-core/react` embedded in Vitest component suites.
  * Validates minimum 4.5:1 text color contrast ratios (`#0F172A` text on `#F8FAFC` base), 3px solid `#003B46` focus rings with 2px offset, minimum 48x48px touch targets, and proper `aria-live` region announcements for dynamic schedule changes.

### FR-04: Smart "Night-Before" Push Notifications
* **Requirement:** Users can opt-in to receive mobile push notifications the evening before their collection day in their selected language.
* **TDD Strategy:** 
  * Unit test cron worker and push dispatcher logic to ensure reminders fire precisely at 6:00 PM local time with correct bilingual payload structures.

### FR-05: The "He Aha Tēnei?" (What is this?) Sorting Search
* **Requirement:** A searchable index of common household waste items mapped directly to WCC disposal regulations, fully localized in English or Te Reo Māori.
* **TDD Strategy:** 
  * Component interaction tests simulate keyboard typing and screen reader navigation to ensure sorting results render instantly and clearly.

---

## 4. Non-Functional Requirements (NFR)
* **NFR-01: Performance:** First Contentful Paint (FCP) under 1.5 seconds on mobile 4G networks; Lighthouse Accessibility and Best Practices scores of 100.
* **NFR-02: Offline Resilience:** PWA service worker must cache core assets and user-selected address schedules to allow offline viewing when mobile coverage drops in difficult Wellington topography.
* **NFR-03: Testing Standards & Quality Assurance:** All features follow strict Test-Driven Development (Red-Green-Refactor). Test suites execute via Vitest with continuous integration checks blocking merges if test coverage dips below 90%.