/**
 * holidays: the NZ/Wellington public holidays that shift WCC collection
 * days, for calendar year 2026 (vision.md §4B: "Good Friday or Christmas
 * moving to Saturday"). Idempotent by delete-then-reinsert, following the
 * same pattern as db/seeds/01_addresses.js and db/seeds/02_sorting_rules.js
 * (ADR 0012) — no other table has a foreign key into holidays, so there is
 * no downstream ON DELETE SET NULL effect from a re-run.
 *
 * Row set and shift_days confirmed against WCC's published collection
 * policy (issue #78, ADR 0038): "Rubbish and recycling are not collected
 * on: Christmas Day, New Year's Day, Good Friday. Instead, the collection
 * is moved to the following Saturday. On all other holidays, collection
 * days are as normal."
 * (https://wellington.govt.nz/rubbish-recycling-and-waste/when-to-put-out-your-rubbish-and-recycling/suburban-and-inner-city-collections,
 * fetched 2026-08-03). Only these three holidays shift collection — the
 * placeholder's "Day after New Year's Day" and "Boxing Day (observed)"
 * rows are removed, and none of Wellington Anniversary Day, Waitangi Day,
 * Easter Monday, ANZAC Day observed, King's Birthday, Matariki, or Labour
 * Day are added, all per the same "on all other holidays, collection days
 * are as normal" rule. `shift_days` is derived per row from how many days
 * separate the holiday's actual 2026 weekday from "the following
 * Saturday" (ADR 0038) — not a uniform 1: New Year's Day 2026-01-01 is a
 * Thursday, so it shifts 2 days to Saturday 2026-01-03; Good Friday and
 * Christmas Day both fall on a Friday in 2026, so each shifts 1 day to
 * Saturday.
 *
 * The Te Reo Māori names below are still an unreviewed draft pending a
 * fluent-speaker review (same open caveat as issue #69/sorting_rules) —
 * #78 confirmed the English row set and shift_days but explicitly could
 * not close this part of its acceptance criteria. Do not treat name_mi as
 * verified.
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
      shift_days: 2,
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
  ]);
};
