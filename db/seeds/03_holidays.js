/**
 * holidays: the NZ/Wellington public holidays that shift WCC collection
 * days, for calendar year 2026 (vision.md §4B: "Good Friday or Christmas
 * moving to Saturday"). Idempotent by delete-then-reinsert, following the
 * same pattern as db/seeds/01_addresses.js and db/seeds/02_sorting_rules.js
 * (ADR 0012) — no other table has a foreign key into holidays, so there is
 * no downstream ON DELETE SET NULL effect from a re-run.
 *
 * UNVERIFIED CONTENT — placeholder data, the same status as the
 * recycling-week epoch (architecture.md §2B, ADR 0016, issue #59) and the
 * sorting_rules seed (issue #69/#70): dates are drafted from the public
 * Holidays Act 1981 Mondayisation rule and Easter 2026 falling on 5 April,
 * not confirmed against WCC's own published collection calendar, and the
 * Te Reo Māori names are an unreviewed draft pending a fluent-speaker
 * review (same caveat as issue #69). A follow-up confirmation issue should
 * be filed before this data is relied on for a real user-facing shift
 * alert (#23/#24).
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.seed = async function seed(knex) {
  await knex("holidays").del();
  await knex("holidays").insert([
    {
      holiday_date: "2026-01-01",
      name_en: "New Year's Day",
      name_mi: "Te Rā Tau Hou",
      shift_days: 1,
    },
    {
      holiday_date: "2026-01-02",
      name_en: "Day after New Year's Day",
      name_mi: "Te Rā i muri i te Tau Hou",
      shift_days: 1,
    },
    {
      holiday_date: "2026-04-03",
      name_en: "Good Friday",
      name_mi: "Te Paraire Pai",
      shift_days: 1,
    },
    {
      holiday_date: "2026-12-25",
      name_en: "Christmas Day",
      name_mi: "Te Rā Kirihimete",
      shift_days: 1,
    },
    {
      holiday_date: "2026-12-28",
      name_en: "Boxing Day (observed)",
      name_mi: "Te Rā Poeke (i whakatakotoria)",
      shift_days: 1,
    },
  ]);
};
