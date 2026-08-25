#!/usr/bin/env node
/**
 * STARLUX Airlines (JX) flight-schedule harvester → gcmp Phase-11 seed catalog.
 * ============================================================================
 *
 * WHAT THIS IS
 *   A repeatable, dependency-free (Node >= 18 built-in fetch) harvester for the
 *   OFFICIAL STARLUX public schedule API:
 *
 *     GET https://ecapi.starlux-airlines.com/flightSchedule/v2/timetable
 *         ?depAirport=TPE&arrAirport=NRT&date=YYYY-MM-DD
 *
 *   The response always returns HTTP 200; an unflown pair yields an empty
 *   `data.timetable`. A hit returns one timetable row per flight number, each
 *   carrying a `schedule` array of 7 consecutive operating dates centred on the
 *   query date — enough to derive the weekly pattern for one pair-direction.
 *
 * QUARTERLY REFRESH GOVERNANCE
 *   Run this script each quarter before re-certifying the JX rows in
 *   `public/data/schedules/current.json`, as part of the chart-drift review
 *   workflow (docs/process/chart-drift-checklist.md). Every raw response body
 *   is cached verbatim under `.agent-teams/gcmp-phase11/jx/raw/` as evidence,
 *   and every emitted catalog entry cites the exact query URL it was derived
 *   from (`sourceUrls`) with `confidence: 'chart-verified'`.
 *
 * USAGE
 *   node scripts/harvest-jx-schedules.mjs [--date YYYY-MM-DD] [--delay MS]
 *        [--out DIR] [--merge PATH_TO_current.json] [--pairs A-B,C-D] [--dry-run]
 *
 *   --date    Query date (default: today + 18 days — inside the sweet spot
 *             where the API returns ALL flights on a pair; very-near dates
 *             sometimes return fewer). Use ONE date for all pairs per run.
 *   --delay   Politeness delay between requests in ms (default 250; hard min 200).
 *   --out     Evidence output directory (default .agent-teams/gcmp-phase11/jx).
 *   --merge   After deriving, splice entries into the schedule catalog:
 *             same-carrier+pair rows are SUPERSEDED, others preserved as-is,
 *             `lastVerified` bumped to today. Catalog is rewritten one-entry-
 *             per-line which round-trips the checked-in formatting byte-for-byte.
 *   --pairs   Comma-separated ordered pair override (default: full network).
 *   --dry-run Print the pair list and exit without fetching.
 *   --derive  Derive-only: process every pair through the SAME cache-first
 *             path (a pair is fetched ONLY if its raw file is missing or an
 *             invalid throttle/error body — never wholesale refetching) and
 *             emit <out>/jx-schedule-entries.json instead of the default
 *             derived-schedule-entries.json. Mutually exclusive with --merge.
 *
 * POLITENESS & RESUME
 *   The API returns HTTP 200 with body {"success":false,"message":{"code":
 *   "99210"}} ("Too Many Attempts.") when throttled — observed after ~100
 *   requests at 250ms spacing (2026-08-25). The harvester detects 99210,
 *   backs off globally (doubles an extra inter-request delay up to 6s and
 *   cools down before retrying), and recovers pacing gradually afterwards.
 *   A cached raw body that parses as a valid success response is REUSED on
 *   re-runs (same pair + query date), so an interrupted run resumes without
 *   re-fetching what it already harvested. Throttle/error bodies never count
 *   as valid cache and are always re-fetched.
 *
 * DERIVATION RULINGS (captain, Phase-11 — do not lighten):
 *   1. Both directions of every route are harvested (ordered pairs).
 *   2. daysOfWeek = distinct ISO weekdays (Mon=1..Sun=7, Date.UTC +
 *      getUTCDay(), 0→7) across the UNION of all flights' passenger-operating
 *      dates on the pair (schedule minus cargoOnly-flagged dates).
 *   3. All flights of one pair collapse into ONE ScheduleEntry
 *      (flightNumbers = sorted unique list); differing per-flight operating
 *      days are documented in notes (the schema uniqueness key cannot hold
 *      two rows for one pair/window).
 *      AMENDED (captain cross-check 2026-08-25): one pair-response can carry
 *      MULTIPLE rows per flightNo — identical-time duplicates are separate
 *      effective windows, differing dep/arr times are sub-seasonal changes,
 *      same-time/different-model rows are day-level equipment swaps. Rows are
 *      DEDUPED by flightNo, their schedule[] arrays UNIONED for daysOfWeek,
 *      and distinct time sets recorded in the row's notes
 *      ("JX0233 depTimes observed: 08:00/08:05/08:15").
 *   4. effectiveFrom/effectiveUntil = earliest/latest observed date — stale
 *      entries self-silence outside the observed horizon. status='operating'.
 *   5. confidence='chart-verified'; sourceUrls=[exact query URL]; notes carry
 *      equipment, dep/arr times per flight, observed window, harvest date,
 *      anomalies (cargoOnly / stops / pendingApproval / red-eye arrivals).
 *   6. Pairs whose schedule dates are ALL cargoOnly are skipped (cargo does
 *      not belong in passenger award routings); partial cargoOnly → keep+note.
 *   7. Empty timetable ⇒ route not flown ⇒ recorded in the evidence index as
 *      a negative, NOT in the catalog. Each empty pair gets ONE retry at
 *      queryDate+14d before being recorded (near-term load-sheet noise).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = 'https://ecapi.starlux-airlines.com/flightSchedule/v2/timetable';

// ---------------------------------------------------------------------------
// Route universe (Phase-11 discovery, 2026-08-25).
//
// Stations were discovered from STARLUX's own sitemap.xml campaign pages plus
// the Wikipedia 'Starlux Airlines' destination table (as of 2026-01) — the
// UNIVERSE ONLY. Provenance tags below mark WHY each station was probed; every
// emitted catalog entry's evidence remains the official API response alone.
//
//   wikipedia-operating : listed as current passenger destination
//   wikipedia-soon      : announced launch (probed; may legitimately be empty yet)
//   wikipedia-charter   : charter-only or suspended service
//   extra-probe         : not on Wikipedia table; probed to settle doubt
// ---------------------------------------------------------------------------
const TAIWAN_STATIONS = [
  { code: 'TPE', name: 'Taipei-Taoyuan', tag: 'hub' },
  { code: 'RMQ', name: 'Taichung', tag: 'focus-city' },
  { code: 'KHH', name: 'Kaohsiung', tag: 'wikipedia-soon (begins 2027-01-01)' },
];

const OUT_STATIONS = [
  // East Asia
  { code: 'HKG', name: 'Hong Kong', tag: 'wikipedia-operating' },
  { code: 'MFM', name: 'Macau', tag: 'wikipedia-operating' },
  { code: 'ICN', name: 'Seoul-Incheon', tag: 'extra-probe (absent from wiki table)' },
  { code: 'PUS', name: 'Busan-Gimhae', tag: 'wikipedia-operating' },
  { code: 'NRT', name: 'Tokyo-Narita', tag: 'wikipedia-operating' },
  { code: 'KIX', name: 'Osaka-Kansai', tag: 'wikipedia-operating' },
  { code: 'UKB', name: 'Kobe', tag: 'wikipedia-operating' },
  { code: 'NGO', name: 'Nagoya-Chubu', tag: 'wikipedia-operating' },
  { code: 'FUK', name: 'Fukuoka', tag: 'wikipedia-operating' },
  { code: 'OKA', name: 'Okinawa-Naha', tag: 'wikipedia-operating' },
  { code: 'CTS', name: 'Sapporo-New Chitose', tag: 'wikipedia-operating' },
  { code: 'SDJ', name: 'Sendai', tag: 'wikipedia-operating' },
  { code: 'HKD', name: 'Hakodate', tag: 'wikipedia-operating' },
  { code: 'KMJ', name: 'Kumamoto', tag: 'wikipedia-operating' },
  { code: 'TAK', name: 'Takamatsu', tag: 'wikipedia-operating' },
  { code: 'SHM', name: 'Shimojishima', tag: 'wikipedia-operating' },
  { code: 'TKS', name: 'Tokushima', tag: 'wikipedia-charter' },
  // Southeast Asia
  { code: 'SIN', name: 'Singapore', tag: 'wikipedia-operating' },
  { code: 'KUL', name: 'Kuala Lumpur', tag: 'wikipedia-operating' },
  { code: 'PEN', name: 'Penang', tag: 'wikipedia-charter (terminated per wiki)' },
  { code: 'MNL', name: 'Manila', tag: 'wikipedia-operating' },
  { code: 'CEB', name: 'Cebu', tag: 'wikipedia-operating' },
  { code: 'CRK', name: 'Clark', tag: 'wikipedia-operating' },
  { code: 'SGN', name: 'Ho Chi Minh City', tag: 'wikipedia-operating' },
  { code: 'HAN', name: 'Hanoi', tag: 'wikipedia-operating' },
  { code: 'DAD', name: 'Da Nang', tag: 'wikipedia-operating' },
  { code: 'PQC', name: 'Phu Quoc', tag: 'wikipedia-operating' },
  { code: 'BKK', name: 'Bangkok-Suvarnabhumi', tag: 'wikipedia-operating' },
  { code: 'CNX', name: 'Chiang Mai', tag: 'wikipedia-operating' },
  { code: 'CGK', name: 'Jakarta', tag: 'wikipedia-operating' },
  { code: 'DPS', name: 'Bali-Denpasar', tag: 'wikipedia-soon (begins 2026-10-01)' },
  // Oceania (announced)
  { code: 'SYD', name: 'Sydney', tag: 'wikipedia-soon (begins 2027)' },
  { code: 'AKL', name: 'Auckland', tag: 'wikipedia-soon (begins 2027)' },
  // North America
  { code: 'LAX', name: 'Los Angeles', tag: 'wikipedia-operating' },
  { code: 'SFO', name: 'San Francisco', tag: 'wikipedia-operating' },
  { code: 'ONT', name: 'Ontario CA', tag: 'wikipedia-operating' },
  { code: 'SEA', name: 'Seattle', tag: 'wikipedia-operating' },
  { code: 'PHX', name: 'Phoenix', tag: 'wikipedia-operating' },
  // Europe
  { code: 'PRG', name: 'Prague', tag: 'wikipedia-soon (begins 2026-08)' },
  // Pacific charter
  { code: 'GUM', name: 'Guam', tag: 'wikipedia-charter' },
];

/** Ordered pairs: Taiwan↔outstation both directions + intra-Taiwan probes. */
export function buildPairList() {
  const outCodes = OUT_STATIONS.map((s) => s.code);
  const pairs = [];
  const seen = new Set();
  const push = (a, b) => {
    const key = `${a}-${b}`;
    if (a !== b && !seen.has(key)) {
      seen.add(key);
      pairs.push([a, b]);
    }
  };
  for (const tw of TAIWAN_STATIONS.map((s) => s.code)) {
    for (const out of outCodes) {
      push(tw, out);
      push(out, tw);
    }
  }
  const twCodes = TAIWAN_STATIONS.map((s) => s.code);
  for (let i = 0; i < twCodes.length; i++) {
    for (let j = i + 1; j < twCodes.length; j++) {
      push(twCodes[i], twCodes[j]);
      push(twCodes[j], twCodes[i]);
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    delay: 250,
    dryRun: false,
    merge: null,
    out: join(REPO_ROOT, '.agent-teams/gcmp-phase11/jx'),
    pairs: null,
    date: null,
    derive: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--delay') args.delay = Number(argv[++i]);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--derive') args.derive = true;
    else if (a === '--merge') args.merge = argv[++i];
    else if (a === '--out') args.out = resolve(process.cwd(), argv[++i]);
    else if (a === '--pairs') args.pairs = argv[++i];
    else if (a === '--date') args.date = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (args.derive && args.merge) {
    throw new Error('--derive and --merge are mutually exclusive');
  }
  if (!Number.isFinite(args.delay) || args.delay < 200) args.delay = 200; // politeness floor
  if (!args.date) {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + 18);
    args.date = t.toISOString().slice(0, 10);
  }
  args.pairsList = args.pairs
    ? args.pairs.split(',').map((p) => p.trim().split('-'))
    : buildPairList();
  return args;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pairUrl(from, to, date) {
  return `${API_BASE}?depAirport=${from}&arrAirport=${to}&date=${date}`;
}

/** A cached body is reusable ONLY if it is a genuine success timetable. */
function isValidTimetableBody(body) {
  try {
    const json = JSON.parse(body);
    return json?.success === true && Array.isArray(json?.data?.timetable);
  } catch {
    return false;
  }
}

function readValidCache(rawDir, from, to, date) {
  const file = join(rawDir, `${from}-${to}--${date}.json`);
  try {
    const body = readFileSync(file, 'utf8');
    return isValidTimetableBody(body) ? body : null;
  } catch {
    return null;
  }
}

// Adaptive pacing state: grows on 99210 throttle hits, shrinks on success.
let paceExtraMs = 0;

async function fetchTimetable(from, to, date, baseDelay) {
  const url = pairUrl(from, to, date);
  let netErrors = 0;
  for (let attempt = 1; attempt <= 8; attempt++) {
    await sleep(attempt === 1 ? baseDelay + paceExtraMs : 1000 * attempt);
    let res;
    let body;
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(30_000),
      });
      body = await res.text();
    } catch (err) {
      netErrors++;
      if (netErrors >= 3) return { ok: false, status: 0, url, error: String(err) };
      continue;
    }
    let json = null;
    try {
      json = JSON.parse(body);
    } catch {
      // fall through — malformed bodies are handled by the caller
    }
    if (json?.success === false && json?.message?.code === '99210') {
      paceExtraMs = Math.min(paceExtraMs * 2 + 500, 6000);
      const cooldown = Math.min(15_000 * attempt, 45_000);
      console.warn(`THROTTLED ${from}-${to} attempt ${attempt}: cooling ${cooldown}ms (paceExtra=${paceExtraMs}ms)`);
      await sleep(cooldown);
      continue;
    }
    if (paceExtraMs > 0) paceExtraMs = Math.max(0, paceExtraMs - 250);
    return { ok: true, status: res.status, url, body };
  }
  return { ok: false, status: 200, url, error: 'throttled after 8 attempts' };
}

function isoWeekday(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sunday..6=Saturday
  return dow === 0 ? 7 : dow;
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Parse one cached response body into {flights} or {empty:true}. */
function parseTimetable(body) {
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    return { malformed: true };
  }
  const table = json?.data?.timetable;
  if (!Array.isArray(table)) return { malformed: true };
  return { flights: table };
}

/**
 * Collapse a pair's timetable rows into ONE ScheduleEntry (rulings 2-6), or
 * return null with a skip reason when the pair must NOT enter the catalog.
 *
 * AMENDED ruling #3 (captain cross-check 2026-08-25): one pair-response can
 * carry MULTIPLE rows per flightNo — identical-time duplicates are separate
 * effective windows, differing times are sub-seasonal changes, and day-level
 * equipment swaps appear as same-no/same-time/different-model rows. Dedupe by
 * flightNo, UNION every row's schedule[] into that flightNo's operating dates,
 * keep ONE catalog row per ordered pair, and record the distinct dep/arr time
 * sets in notes.
 */
export function deriveEntry(from, to, flights, queryUrl, queryDate, harvestDate) {
  /** @type {Map<string, object>} flightNo -> aggregated observation */
  const byFlight = new Map();
  for (const f of flights) {
    const no = f.flightNo;
    if (!byFlight.has(no)) {
      byFlight.set(no, {
        models: new Set(),
        depArrs: new Set(),
        depTimes: new Set(),
        arrTimes: new Set(),
        maxArrDayDiff: 0,
        paxDates: new Set(),
        cargoOnlyDates: new Set(),
        stops: false,
        pendingApproval: false,
      });
    }
    const g = byFlight.get(no);
    const sched = Array.isArray(f.schedule) ? f.schedule : [];
    const cargoSet = new Set(Array.isArray(f.cargoOnly) ? f.cargoOnly : []);
    for (const d of sched) {
      if (cargoSet.has(d)) g.cargoOnlyDates.add(d);
      else g.paxDates.add(d);
    }
    g.models.add(f.aircraftModel ?? f.aircraftCode ?? 'unknown');
    g.depArrs.add(`${f.depTime}-${f.arrTime}`);
    g.depTimes.add(f.depTime);
    g.arrTimes.add(f.arrTime);
    g.maxArrDayDiff = Math.max(g.maxArrDayDiff, f.arrivalDaysDifference ?? 0);
    if ((Array.isArray(f.stops) ? f.stops : []).length > 0) g.stops = true;
    if ((Array.isArray(f.pendingApproval) ? f.pendingApproval : []).length > 0) {
      g.pendingApproval = true;
    }
  }

  const paxUnion = [...new Set([...byFlight.values()].flatMap((g) => [...g.paxDates]))].sort();
  if (paxUnion.length === 0) {
    return { entry: null, skipReason: 'all-cargo-only' };
  }

  const daysOfWeek = [...new Set(paxUnion.map(isoWeekday))].sort((a, b) => a - b);
  const flightNos = [...byFlight.keys()].sort();

  // Equipment note: unique flightNos grouped by airframe. A flightNo with a
  // day-level equipment swap legitimately appears under several models.
  const byModel = new Map();
  for (const [no, g] of byFlight) {
    for (const model of g.models) {
      if (!byModel.has(model)) byModel.set(model, new Set());
      byModel.get(model).add(no);
    }
  }
  const equipmentNote =
    'equipment: ' +
    [...byModel.entries()]
      .map(([m, nos]) => `${m} (${[...nos].sort().join(',')})`)
      .join('; ');

  // Times note: single time-set flightNos render compactly; multi-set ones
  // get the captain's "depTimes observed:" form so sub-seasonal changes and
  // separate effective windows stay visible in the catalog itself.
  const fmtFlight = (no) => {
    const g = byFlight.get(no);
    const suffix = g.maxArrDayDiff > 0 ? ` (+${g.maxArrDayDiff}d)` : '';
    if (g.depArrs.size === 1) return `${no} ${[...g.depArrs][0]}${suffix}`;
    return (
      `${no} depTimes observed: ${[...g.depTimes].sort().join('/')}` +
      ` (arrTimes: ${[...g.arrTimes].sort().join('/')})${suffix}`
    );
  };
  const timesNote = 'times: ' + flightNos.map(fmtFlight).join(', ');

  const notes = [
    equipmentNote,
    timesNote,
    `observed window ${paxUnion[0]}..${paxUnion[paxUnion.length - 1]}`,
    `harvested ${harvestDate} from official STARLUX ecapi flightSchedule v2`,
  ];

  // Day-split documentation: any flightNo whose weekday set differs from the
  // union gets spelled out so the collapse stays auditable.
  const splits = [];
  for (const no of flightNos) {
    const set = [...new Set([...byFlight.get(no).paxDates].map(isoWeekday))].sort((a, b) => a - b);
    if (set.length !== daysOfWeek.length || set.some((d, i) => d !== daysOfWeek[i])) {
      splits.push(`${no} days{${set.join(',')}}`);
    }
  }
  if (splits.length > 0) notes.push(`day split: ${splits.join('; ')}`);

  // Anomalies (ruling 5).
  const partialCargo = flightNos.filter((no) => byFlight.get(no).cargoOnlyDates.size > 0);
  if (partialCargo.length > 0) {
    notes.push(
      'partial cargoOnly dates excluded: ' +
        partialCargo.map((no) => `${no}: ${[...byFlight.get(no).cargoOnlyDates].sort().join('/')}`).join('; '),
    );
  }
  const stopped = flightNos.filter((no) => byFlight.get(no).stops);
  if (stopped.length > 0) {
    notes.push(`stops anomaly: ${stopped.join(',')}`);
  }
  const pending = flightNos.filter((no) => byFlight.get(no).pendingApproval);
  if (pending.length > 0) {
    notes.push(`pendingApproval flags: ${pending.join(',')}`);
  }

  return {
    entry: {
      carrier: 'JX',
      pair: [from, to],
      daysOfWeek,
      flightNumbers: flightNos,
      effectiveFrom: paxUnion[0],
      effectiveUntil: paxUnion[paxUnion.length - 1],
      status: 'operating',
      confidence: 'chart-verified',
      sourceUrls: [queryUrl],
      notes,
    },
    skipReason: null,
  };
}

/** Serialize the catalog one-entry-per-line (round-trips checked-in format). */
function serializeCatalog(catalog) {
  const lines = ['{'];
  lines.push(`  "version": ${JSON.stringify(catalog.version)},`);
  lines.push(`  "lastVerified": ${JSON.stringify(catalog.lastVerified)},`);
  lines.push('  "entries": [');
  catalog.entries.forEach((entry, i) => {
    const comma = i < catalog.entries.length - 1 ? ',' : '';
    lines.push(`    ${JSON.stringify(entry)}${comma}`);
  });
  lines.push('  ]');
  lines.push('}');
  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv);
  const harvestDate = new Date().toISOString().slice(0, 10);
  console.log(
    `JX harvest: ${args.pairsList.length} ordered pairs, queryDate=${args.date}, delay=${args.delay}ms`,
  );
  if (args.dryRun) {
    for (const [a, b] of args.pairsList) console.log(`${a}-${b}`);
    return;
  }

  const rawDir = join(args.out, 'raw');
  mkdirSync(rawDir, { recursive: true });

  const entries = [];
  const positives = [];
  const negatives = [];
  const skippedCargo = [];

  for (const [from, to] of args.pairsList) {
    // Resume support: a valid cached body for this pair+date skips the wire.
    // Cached bodies are wrapped in the same {ok,url,body} shape as fetches.
    const cachedBody = readValidCache(rawDir, from, to, args.date);
    const primary = cachedBody
      ? { ok: true, status: 200, url: pairUrl(from, to, args.date), body: cachedBody }
      : await fetchTimetable(from, to, args.date, args.delay);
    if (!primary.ok) {
      const result = String(primary.error).includes('throttled') ? 'throttled' : 'http-error';
      negatives.push({ pair: [from, to], attempts: [{ date: args.date, result, detail: primary.error }] });
      console.error(`${result.toUpperCase()} ${from}-${to}: ${primary.error}`);
      continue;
    }
    if (!cachedBody) writeFileSync(join(rawDir, `${from}-${to}--${args.date}.json`), primary.body);
    const parsed = parseTimetable(primary.body);
    if (parsed.malformed) {
      negatives.push({ pair: [from, to], attempts: [{ date: args.date, result: 'malformed-response' }] });
      console.error(`MALFORMED ${from}-${to}`);
      continue;
    }
    if (parsed.flights.length === 0) {
      // Captain tip codified: one retry at date+14d before recording negative.
      const retryDate = addDays(args.date, 14);
      const retryCached = readValidCache(rawDir, from, to, retryDate);
      const retry = retryCached
        ? { ok: true, status: 200, url: pairUrl(from, to, retryDate), body: retryCached }
        : await fetchTimetable(from, to, retryDate, args.delay);
      if (!retry.ok && !retryCached) {
        const result = String(retry.error).includes('throttled') ? 'throttled' : 'http-error';
        negatives.push({
          pair: [from, to],
          attempts: [
            { date: args.date, result: 'empty' },
            { date: retryDate, result, detail: retry.error },
          ],
        });
        console.error(`RETRY-${result.toUpperCase()} ${from}-${to}`);
        continue;
      }
      if (!retryCached) writeFileSync(join(rawDir, `${from}-${to}--${retryDate}.json`), retry.body);
      const attempt2 = parseTimetable(retry.body);
      const stillEmpty = !attempt2.malformed && attempt2.flights.length === 0;
      if (stillEmpty) {
        negatives.push({
          pair: [from, to],
          attempts: [
            { date: args.date, result: 'empty' },
            ...(retryCached || retry.ok ? [{ date: retryDate, result: 'empty' }] : []),
          ],
        });
      } else if (!attempt2.malformed) {
        const derived = deriveEntry(from, to, attempt2.flights, pairUrl(from, to, retryDate), retryDate, harvestDate);
        if (derived.entry) {
          entries.push(derived.entry);
          positives.push({ pair: [from, to], flights: attempt2.flights.length, queryDate: retryDate });
        }
      } else {
        negatives.push({ pair: [from, to], attempts: [{ date: args.date, result: 'empty' }, { date: retryDate, result: 'malformed-response' }] });
      }
      console.log(`NEGATIVE ${from}-${to} (retried ${retryDate})`);
      continue;
    }

    const derived = deriveEntry(from, to, parsed.flights, primary.url, args.date, harvestDate);
    if (derived.entry) {
      entries.push(derived.entry);
      positives.push({ pair: [from, to], flights: parsed.flights.length, queryDate: args.date });
      console.log(`POSITIVE  ${from}-${to}: ${parsed.flights.length} flights, days{${derived.entry.daysOfWeek.join(',')}}`);
    } else {
      skippedCargo.push({ pair: [from, to], reason: derived.skipReason });
      console.log(`SKIP      ${from}-${to}: ${derived.skipReason}`);
    }
  }

  entries.sort((a, b) => a.pair[0].localeCompare(b.pair[0]) || a.pair[1].localeCompare(b.pair[1]));
  // --derive emits the captain-named artifact; the default run keeps its
  // historical filename. Content shape is identical either way.
  const derivedOutName = args.derive ? 'jx-schedule-entries.json' : 'derived-schedule-entries.json';
  writeFileSync(
    join(args.out, derivedOutName),
    JSON.stringify({ harvestDate, queryDate: args.date, count: entries.length, entries }, null, 2) + '\n',
  );
  writeFileSync(
    join(args.out, 'evidence-index.json'),
    JSON.stringify(
      { harvestDate, queryDate: args.date, apiBase: API_BASE, positiveCount: positives.length, negativesCount: negatives.length, skippedCargoOnlyCount: skippedCargo.length, positives, negatives, skippedCargoOnly: skippedCargo },
      null,
      2,
    ) + '\n',
  );

  console.log(
    `\nDone: ${entries.length} entries, ${positives.length} positive pairs, ${negatives.length} negatives, ${skippedCargo.length} cargo-skipped.`,
  );
  if (args.derive) {
    console.log(`--derive mode: wrote ${join(args.out, derivedOutName)} (merge skipped).`);
  }
  if (args.merge && entries.length === 0) {
    console.error('MERGE SKIPPED: zero entries derived — catalog left untouched.');
  }

  if (args.merge && entries.length > 0) {
    const catalogPath = resolve(process.cwd(), args.merge);
    const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
    const harvestedKeys = new Set(entries.map((e) => e.pair.join('-')));
    // Supersede same-carrier+pair rows (schema uniqueness key forbids two
    // rows sharing carrier|pair|season-window); everything else verbatim.
    const kept = catalog.entries.filter(
      (e) => !(e.carrier === 'JX' && harvestedKeys.has(e.pair.join('-'))),
    );
    const superseded = catalog.entries.length - kept.length;
    catalog.lastVerified = harvestDate;
    catalog.entries = [...kept, ...entries];
    writeFileSync(catalogPath, serializeCatalog(catalog));
    console.log(
      `Merged into ${catalogPath}: kept ${kept.length}, superseded ${superseded}, appended ${entries.length}, total ${catalog.entries.length}. lastVerified=${harvestDate}`,
    );
  }
}

// Run only when executed directly (importable for offline derivation tests).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
