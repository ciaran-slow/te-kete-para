/* eslint-disable @typescript-eslint/no-require-imports --
   Plain Node CommonJS script, run manually with `node`, not bundled. */
/**
 * One-time data-sourcing tool (issue #178, ADR 0075) — not part of the app
 * or CI. Bulk-imports Wellington's street/suburb registry from WCC's own
 * street-search autocomplete endpoint (the same one ADR 0059/0060 already
 * reverse-engineered), writing the result as a static, checked-in JSON
 * fixture consumed by `db/seeds/01_addresses.js`. Run manually:
 *
 *   node scripts/import-wellington-streets.js
 *
 * The endpoint does a prefix match (not substring) and caps results around
 * 100 per query, so this enumerates every two-letter prefix and escalates
 * to three-letter prefixes for any two-letter prefix that looks truncated,
 * deduping by the endpoint's own numeric streetId.
 */
const fs = require("fs");
const path = require("path");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const ENDPOINT = "https://wellington.govt.nz/handlers/RubbishCollectionStreetsHandler.ashx";
const CAP_THRESHOLD = 95; // escalate any prefix whose result count is at or above this
const REQUEST_DELAY_MS = 200;
const OUTPUT_PATH = path.join(__dirname, "..", "db", "seeds", "data", "wellington-streets.json");

const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetches one prefix term against the live endpoint. Returns `[]` (and logs
 * a warning) on any non-200 response or JSON-parse failure, rather than
 * throwing — one bad prefix must not abort the whole run.
 */
async function fetchTerm(term) {
  try {
    const response = await fetch(`${ENDPOINT}?term=${encodeURIComponent(term)}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!response.ok) {
      console.warn(`[import] term=${term}: HTTP ${response.status}, treating as empty.`);
      return [];
    }
    const body = await response.json();
    if (!Array.isArray(body)) {
      console.warn(`[import] term=${term}: response was not an array, treating as empty.`);
      return [];
    }
    return body;
  } catch (err) {
    console.warn(`[import] term=${term}: fetch failed (${err.message}), treating as empty.`);
    return [];
  }
}

/**
 * Normalizes a street/suburb name for curated-vs-bulk comparison only (the
 * output data itself keeps WCC's original spelling unchanged). WCC's
 * registry uses abbreviations ("Mt Victoria") the 17 curated rows spell out
 * in full ("Mount Victoria") — an exact-string or case-insensitive-only
 * comparison misses this and lets a bulk row shadow/duplicate a curated
 * street under the abbreviated spelling (found live: "Majoribanks Street,
 * Mt Victoria" and "Adelaide Road, Mt Cook" both duplicated a curated,
 * WCC-confirmed row). Expands "Mt"/"St" to "Mount"/"Saint" at a word
 * boundary before lowercasing, so both spellings collapse to the same key.
 */
function normalizeForComparison(value) {
  return value
    .replace(/\bMt\b\.?/gi, "Mount")
    .replace(/\bSt\b\.?/gi, "Saint")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses one `{label, value}` row into `{streetName, suburb}`, or `null` if
 * the label can't be parsed (logged, not thrown, so one bad row doesn't
 * abort the run).
 */
function parseLabel(label) {
  // Strip exactly one trailing parenthetical group first — some annotations
  // contain their own comma (e.g. "(odds 9-43, evens 2-40)"), so splitting
  // on the last comma before stripping would cut into it.
  const stripped = label.replace(/\s*\([^()]*\)\s*$/, "");
  const lastCommaIndex = stripped.lastIndexOf(", ");
  if (lastCommaIndex === -1) {
    console.warn(`[import] Unparseable label (no suburb found): "${label}"`);
    return null;
  }
  const streetName = stripped.slice(0, lastCommaIndex).trim();
  const suburb = stripped.slice(lastCommaIndex + 2).trim();
  if (streetName.length === 0 || suburb.length === 0) {
    console.warn(`[import] Unparseable label (empty street/suburb): "${label}"`);
    return null;
  }
  return { streetName, suburb };
}

async function main() {
  const byStreetId = new Map();

  for (const first of ALPHABET) {
    for (const second of ALPHABET) {
      const prefix = `${first}${second}`;
      const results = await fetchTerm(prefix);
      await delay(REQUEST_DELAY_MS);

      if (results.length >= CAP_THRESHOLD) {
        // Possibly truncated at the endpoint's ~100-result cap — escalate to
        // all 26 three-letter extensions and use their union instead.
        for (const third of ALPHABET) {
          const extendedPrefix = `${prefix}${third}`;
          const extendedResults = await fetchTerm(extendedPrefix);
          await delay(REQUEST_DELAY_MS);
          for (const row of extendedResults) {
            byStreetId.set(row.value, row);
          }
        }
      } else {
        for (const row of results) {
          byStreetId.set(row.value, row);
        }
      }
    }
  }

  let unparseableCount = 0;
  const parsedRows = [];
  for (const row of byStreetId.values()) {
    const parsed = parseLabel(row.label);
    if (parsed === null) {
      unparseableCount += 1;
      continue;
    }
    parsedRows.push(parsed);
  }

  // Dedupe by exact (streetName, suburb) pair, case-sensitive — collapses
  // multiple house-number-range segments of the same street/suburb into one
  // registry row.
  const byStreetSuburb = new Map();
  for (const row of parsedRows) {
    byStreetSuburb.set(JSON.stringify([row.streetName, row.suburb]), row);
  }

  // Exclude any bulk row whose (streetName, suburb) matches a curated,
  // WCC-confirmed row after normalizing case and WCC's Mt/St abbreviations
  // (normalizeForComparison) — the curated rows must never be shadowed or
  // duplicated by an unconfirmed import row for the same address.
  const { CURATED_ADDRESSES } = require("../db/seeds/01_addresses.js");
  const curatedKeys = new Set(
    CURATED_ADDRESSES.map((row) =>
      JSON.stringify([
        normalizeForComparison(row.street_name),
        normalizeForComparison(row.suburb),
      ]),
    ),
  );

  let excludedAsCuratedCount = 0;
  const streets = [];
  for (const row of byStreetSuburb.values()) {
    const key = JSON.stringify([
      normalizeForComparison(row.streetName),
      normalizeForComparison(row.suburb),
    ]);
    if (curatedKeys.has(key)) {
      excludedAsCuratedCount += 1;
      continue;
    }
    streets.push(row);
  }

  streets.sort((a, b) => {
    if (a.streetName !== b.streetName) return a.streetName < b.streetName ? -1 : 1;
    if (a.suburb !== b.suburb) return a.suburb < b.suburb ? -1 : 1;
    return 0;
  });

  const output = {
    source: ENDPOINT,
    fetchedAt: new Date().toISOString(),
    streets,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log(
    `[import] Done. ${streets.length} unique streets written to ${OUTPUT_PATH}.\n` +
      `[import] ${excludedAsCuratedCount} rows excluded as already-curated.\n` +
      `[import] ${unparseableCount} rows skipped for unparseable labels.`,
  );
}

// Guarded so this file can be `require`d for `normalizeForComparison` (test
// reuse — see __tests__/db/seeds/addresses.test.ts) without triggering a
// live fetch against wellington.govt.nz as a side effect of the import.
if (require.main === module) {
  main().catch((err) => {
    console.error("[import] Fatal error:", err);
    process.exitCode = 1;
  });
}

module.exports = { normalizeForComparison, parseLabel };
