# Vision: Te Kete Para (BinSync Wellington)

**Product Name:** Te Kete Para (BinSync Wellington)  
**Tagline:** *Tiakina te taiao, kia mauria te para.* Care for the environment, manage the waste. The fully accessible, bilingual rubbish and recycling companion tailored for Te Whanganui-a-Tara.

---

## 1. Executive Summary & Wellington Context
Wellington City Council (WCC) operates unique waste collection logistics across its distinct topography—balancing suburban yellow bags, green glass crates, and wheelie bins with inner-city night collections (yellow bags out between 5:30 PM and 10:00 PM) and strict rules around public holiday shifts (such as Christmas, New Year, and Good Friday shifting to Saturday). 

**Te Kete Para** is a mobile-optimized, bilingual (English and Te Reo Māori) web application built from the ground up to eliminate collection confusion. Crucially, it sets a gold standard for accessibility, ensuring that all Wellingtonians—including those using screen readers, low-vision settings, or motor-accessibility tools—can effortlessly track their local rubbish schedule and sort waste correctly.

---

## 2. Te Reo Māori Integration & Typography
Woven naturally into the user experience to normalize everyday reo usage while maintaining absolute clarity for administrative tasks:
* **Full App Translation:** Every single element of the user journey—from dynamic UI states, buttons, and error messages to push notifications and complex sorting instructions—is fully available in both English and Te Reo Māori.
* **Bilingual UI Toggle:** Seamless one-tap toggle between English and Te Reo Māori across all scheduling states and alerts, with preference persistence via local storage.
* **Culturally Grounded Terminology:** 
  * *Rubbish / General Waste:* Para Whānui (General Refuse)
  * *Recycling:* Rauemi Hangarua (Recyclable Resources)
  * *Glass Crate:* Kete Karāhe (Glass Crate)
  * *Tomorrow:* Āpopo (Tomorrow)
* **Karakia / Kaitiakitanga Micro-Copy:** Positive reinforcement banners highlighting environmental guardianship (*kaitiakitanga*) when users successfully complete a recycling cycle or sort items correctly.
* **Full Macron Support:** Typography driven by **Inter** (body) and **Plus Jakarta Sans** (headings/UI) to guarantee crisp rendering of diacritical marks (`ā`, `ē`, `ī`, `ō`, `ū`) across all mobile and desktop viewports without font fallbacks.

---

## 3. Strict Accessibility Standards (WCAG 2.2 AAA Target)
To serve *all* members of the Wellington community, the app is engineered to meet the highest international web accessibility benchmarks:
* **Screen Reader Optimization (automated checks only for this prototype — ADR 0065):** Semantic HTML landmarks (`<main>`, `<nav>`, `<section>`) and robust `aria-live` regions, verified by automated tooling (axe-core in CI and Vitest, plus a computed-accessibility-tree snapshot proxy for manual QA, ADR 0024). Every icon, dynamic countdown, and bin status change uses descriptive ARIA labels. A human-operated pass with real VoiceOver (iOS), TalkBack (Android), and NVDA/JAWS has not been performed — this prototype does not claim the literal "fully tested with named assistive technology" bar this section originally set.
* **High Contrast & Color System:** Inspired by Wellington's natural landscape and built to meet rigorous contrast requirements (minimum 4.5:1 for body text, 3:1 for large UI text):
  * *Kākāriki (Organics Green):* `#1B4D3E` (Success states, food-scrap bins)
  * *Moana (Harbour Blue):* `#003B46` (Navigation, primary structure, focus rings)
  * *Kōwhai (Warning Accent):* `#B45309` (Amber-gold variant ensuring high-contrast readability for yellow bag alerts)
  * *Papa (Neutral Base):* `#F8FAFC` background with `#0F172A` text to eliminate eye strain.
* **Motor & Cognitive Accessibility:** Minimum 48x48px touch targets, keyboard-only navigation flows with 3px solid focus rings (2px offset), and zero time-out constraints on interactive forms.

---

## 4. Wellington-Specific Core Features

### A. The Suburb & Inner-City Dual Engine
* **Suburban Rules:** Tracks 7:00 AM kerbside drop rules, alternating weekly recycling (glass crates vs. paper/plastic/metal), and container placement around Wellington's unique topography.
* **Inner-City Night Rules:** Automatically shifts behavior for Te Aro and CBD users, switching reminders to evening timeframes (5:30 PM – 10:00 PM yellow bag windows and Tuesday night cardboards).

### B. Smart Holiday & Weather Shift Alerts
* Wellington’s southerlies and holiday schedules disrupt normal routines. The app automatically recalculates changes when collections shift (e.g., Good Friday or Christmas moving to Saturday) and issues proactive alerts.

### C. The "He Aha Tēnei?" (What is this?) Sorting Engine
* A voice-enabled, screen-reader-friendly search bar where users can type or dictate an item (e.g., *pizza box*, *coffee cup*, *aerosol can*). It immediately returns WCC-specific sorting instructions fully localized in English or Te Reo Māori.

---

## 5. Technical Stack & Implementation Blueprint
Built for speed, low latency, and zero-friction access via mobile web browsers without app-store barriers:
* **Frontend:** Next.js (React) configured as a Progressive Web App (PWA), styled with Tailwind CSS, and structured using Radix UI primitives for bulletproof accessibility.
* **Backend & Database:** Node.js API layer backed by **SQLite3 via Knex.js** to manage lightweight regional council schedules, user profiles, address lookups, and bilingual localization strings.
* **Testing Strategy:** Strict Test-Driven Development (TDD) enforced via **Vitest**, including automated accessibility checks (`@axe-core/react`) and translation key parity validation tests.
* **Notifications & Delivery:** Web Push API (via VAPID keys) for reliable "night-before" push reminders, deployed seamlessly on Vercel/Netlify for lightning-fast edge performance across Aotearoa.