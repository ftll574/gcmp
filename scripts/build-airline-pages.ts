/**
 * Build-time script: generate static SEO pages at `/airline/{XX}/index.html`
 * for every operating carrier that appears in any of our program JSONs.
 *
 *   Usage: npx tsx scripts/build-airline-pages.ts
 *
 * Each page is a self-contained, no-JS HTML file that shows:
 *
 *   For carrier {XX}:
 *   - Cabin × fare-class → multiplier matrix per program
 *   - Which programs credit this carrier and at what rate
 *   - Last verified date + source chart link per program
 *
 * SEO win: wheretocredit.com gets a huge chunk of Google traffic from
 * exactly these per-airline pages (/en/JL, /en/AA, etc.). Static + no JS
 * + crawlable. Asian agent's #5 recommendation.
 *
 * Output: public/airline/{XX}/index.html  (one per carrier)
 *         public/airline/index.html         (index of all carriers)
 *
 * Re-run when programs change.
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PROGRAMS_DIR = resolve(ROOT, 'public', 'data', 'programs');
const OUT_DIR = resolve(ROOT, 'public', 'airline');

interface CarrierProgramEntry {
  programId: string;
  programLabel: string;
  programAlliance?: string;
  sourceUrl: string;
  lastVerified: string;
  fareBuckets: Record<string, { cabin: string; pqm: number; rdm: number }>;
}

/** Pre-built map: carrierIATA → list of programs that credit it. */
function buildIndex(): Map<string, CarrierProgramEntry[]> {
  const idx = new Map<string, CarrierProgramEntry[]>();
  for (const dir of readdirSync(PROGRAMS_DIR)) {
    const path = resolve(PROGRAMS_DIR, dir, 'current.json');
    if (!existsSync(path)) continue;
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      program: string;
      label: string;
      alliance?: string;
      sourceUrl: string;
      lastVerified: string;
      carriers: Record<
        string,
        {
          label: string;
          fareBuckets: Record<string, { cabin: string; pqm: number; rdm: number }>;
        }
      >;
    };
    for (const [op, carrier] of Object.entries(raw.carriers)) {
      const list = idx.get(op) ?? [];
      list.push({
        programId: raw.program,
        programLabel: raw.label,
        ...(raw.alliance ? { programAlliance: raw.alliance } : {}),
        sourceUrl: raw.sourceUrl,
        lastVerified: raw.lastVerified,
        fareBuckets: carrier.fareBuckets,
      });
      idx.set(op, list);
    }
  }
  return idx;
}

const CABIN_ORDER = ['first', 'business', 'premium-economy', 'economy'];

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function carrierPageHtml(carrier: string, entries: CarrierProgramEntry[]): string {
  // For each program, gather the fare-buckets sorted by cabin.
  const programBlocks = entries
    .sort((a, b) => a.programLabel.localeCompare(b.programLabel))
    .map((entry) => {
      const buckets = Object.entries(entry.fareBuckets).sort((a, b) => {
        const ca = CABIN_ORDER.indexOf(a[1].cabin);
        const cb = CABIN_ORDER.indexOf(b[1].cabin);
        if (ca !== cb) return ca - cb;
        return b[1].pqm - a[1].pqm;
      });
      const rows = buckets
        .map(
          ([letter, b]) =>
            `      <tr><td class="mono">${letter}</td><td>${esc(b.cabin)}</td><td class="num">${(b.pqm * 100).toFixed(0)}%</td><td class="num">${(b.rdm * 100).toFixed(0)}%</td></tr>`,
        )
        .join('\n');
      return `<section class="program">
  <h3>${esc(entry.programLabel)}${entry.programAlliance ? ` <span class="alliance">· ${esc(entry.programAlliance)}</span>` : ''}</h3>
  <p class="provenance">Verified ${esc(entry.lastVerified)} · <a href="${esc(entry.sourceUrl)}" rel="noopener noreferrer external">Source chart</a></p>
  <table>
    <thead><tr><th>Fare</th><th>Cabin</th><th>PQM</th><th>RDM</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</section>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Earning ${esc(carrier)} on every program — gcmp</title>
  <meta name="description" content="Where to credit ${esc(carrier)} flights — partner earning rates across ${entries.length} loyalty programs, per fare class. Chart-verified, last-updated dates included.">
  <link rel="canonical" href="https://ftll574.github.io/gcmp/airline/${esc(carrier)}/">
  <style>
    :root {
      --tint: #007aff;
      --label: #1d1d1f;
      --secondary: #6e6e73;
      --separator: rgba(60, 60, 67, 0.12);
      --bg: #fff;
      --bg-card: #f2f2f7;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --tint: #0a84ff;
        --label: #fff;
        --secondary: rgba(235, 235, 245, 0.6);
        --separator: rgba(84, 84, 88, 0.65);
        --bg: #000;
        --bg-card: #1c1c1e;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif;
      background: var(--bg);
      color: var(--label);
      line-height: 1.5;
    }
    .container { max-width: 760px; margin: 0 auto; padding: 32px 24px; }
    h1 { font-size: 34px; font-weight: 700; letter-spacing: -0.022em; margin: 0 0 4px; }
    h1 .sub { font-size: 17px; font-weight: 500; color: var(--secondary); display: block; margin-top: 4px; letter-spacing: 0; }
    h3 { font-size: 22px; font-weight: 600; margin: 0 0 4px; letter-spacing: -0.01em; }
    .alliance { font-size: 14px; color: var(--secondary); font-weight: 400; }
    .program { margin: 24px 0; padding: 16px; background: var(--bg-card); border-radius: 14px; }
    .provenance { font-size: 12px; color: var(--secondary); margin: 0 0 12px; font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
    .provenance a { color: var(--tint); }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid var(--separator); }
    th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--secondary); }
    .mono { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 600; color: var(--tint); }
    .num { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 600; text-align: right; }
    .back { display: inline-flex; align-items: center; gap: 4px; color: var(--tint); text-decoration: none; font-size: 14px; margin-bottom: 16px; }
    .back:hover { text-decoration: underline; }
    .footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--separator); font-size: 12px; color: var(--secondary); }
    .calc-link {
      display: inline-block;
      margin-top: 12px;
      padding: 8px 16px;
      background: var(--tint);
      color: #fff;
      border-radius: 9999px;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <a class="back" href="/gcmp/airline/">← All carriers</a>
    <h1>
      Earning ${esc(carrier)}
      <span class="sub">${entries.length} loyalty program${entries.length === 1 ? '' : 's'} credit flights operated by ${esc(carrier)}</span>
    </h1>
    <p>
      <a class="calc-link" href="/gcmp/">Open the routing calculator →</a>
    </p>
${programBlocks}
    <div class="footer">
      <p>Earning rates shown as percentages of distance flown (PQM = Status Miles, RDM = Award Miles). Verified against published partner charts; verify against your actual statement.</p>
      <p>Generated by <a href="/gcmp/">gcmp</a> — open-source mileage runner calculator.</p>
    </div>
  </div>
</body>
</html>`;
}

function indexPageHtml(idx: Map<string, CarrierProgramEntry[]>): string {
  const carriers = [...idx.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const rows = carriers
    .map(([carrier, entries]) => {
      return `      <li><a href="/gcmp/airline/${esc(carrier)}/">${esc(carrier)}</a> <span class="count">${entries.length} program${entries.length === 1 ? '' : 's'}</span></li>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Browse by airline — gcmp</title>
  <meta name="description" content="Browse partner earning rates by operating carrier across all 18 loyalty programs gcmp supports.">
  <link rel="canonical" href="https://ftll574.github.io/gcmp/airline/">
  <style>
    :root { --tint: #007aff; --label: #1d1d1f; --secondary: #6e6e73; --separator: rgba(60,60,67,0.12); --bg: #fff; }
    @media (prefers-color-scheme: dark) { :root { --tint: #0a84ff; --label: #fff; --secondary: rgba(235,235,245,0.6); --separator: rgba(84,84,88,0.65); --bg: #000; } }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif; background: var(--bg); color: var(--label); }
    .container { max-width: 760px; margin: 0 auto; padding: 32px 24px; }
    h1 { font-size: 34px; font-weight: 700; letter-spacing: -0.022em; margin: 0 0 16px; }
    p { color: var(--secondary); line-height: 1.5; }
    ul { list-style: none; padding: 0; margin: 24px 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px; }
    li { padding: 12px 16px; border: 1px solid var(--separator); border-radius: 10px; }
    li a { color: var(--tint); text-decoration: none; font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-weight: 600; font-size: 17px; }
    li a:hover { text-decoration: underline; }
    .count { display: block; font-size: 12px; color: var(--secondary); margin-top: 2px; }
    .back { display: inline-flex; align-items: center; gap: 4px; color: var(--tint); text-decoration: none; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <a class="back" href="/gcmp/">← gcmp routing calculator</a>
    <h1>Browse by airline</h1>
    <p>Pick a carrier to see which loyalty programs credit it, with per-fare-class earning rates.</p>
    <ul>
${rows}
    </ul>
  </div>
</body>
</html>`;
}

// ── Run ──
console.log('Building per-airline SEO pages…');
if (existsSync(OUT_DIR)) {
  rmSync(OUT_DIR, { recursive: true });
}
mkdirSync(OUT_DIR, { recursive: true });

const idx = buildIndex();
console.log(`Found ${idx.size} unique operating carriers across the program registry.`);

for (const [carrier, entries] of idx) {
  const dir = resolve(OUT_DIR, carrier);
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'index.html'), carrierPageHtml(carrier, entries));
  console.log(`  /airline/${carrier}/ — ${entries.length} programs`);
}

writeFileSync(resolve(OUT_DIR, 'index.html'), indexPageHtml(idx));
console.log(`✓ Wrote /airline/index.html with ${idx.size} carriers.`);
