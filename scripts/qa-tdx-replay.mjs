/** Bounded real-Edge smoke against the account-holder's saved public rows.
 * Starts/owns a loopback Vite and an isolated Edge profile. CDP fulfills
 * schedule requests in the test tab BEFORE Vite's proxy. No schedule server,
 * credentials, supplier request, booking, seat lookup, or live fallback.
 * Date is frozen at capture; clipboard is a test spy, not the OS clipboard.
 * This is historical browser QA, NOT current operator/supplier acceptance. */
import { spawn } from 'node:child_process';
import { readFile, stat, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createBrowserOperatorFixtureResolver, createBrowserReplayResolver } from './lib/tdx-browser-replay.ts';
import { CX_INITIAL_OPERATOR_EVIDENCE_CHECKED_AT, LATEST_OPERATOR_EVIDENCE_CHECKED_AT, OPERATOR_EVIDENCE_CHECKED_AT } from '../server/operator-evidence.ts';

const origin = 'http://127.0.0.1:5196';
const directory = resolve('test-results/tdx-browser-replay');
const input = resolve('test-results/tdx-live/snapshot.json');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
let edge, vite, socket;
const pending = new Map();
let nextId = 0;
const checks = [], errors = [], blocked = [];
let fulfilledQueries = 0;
const run = await (async () => { await mkdir(directory, { recursive: true }); return mkdtemp(resolve(directory, 'run-')); })();
function command(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { done, fail, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
try {
  if (process.argv.length > 2) throw new Error('No arguments supported');
  if ((await stat(input)).size > 32_000_000) throw new Error('Snapshot exceeds limit');
  const bytes = await readFile(input);
  const snapshot = JSON.parse(bytes.toString('utf8'));
  const historicalEvidenceTime = Date.parse(CX_INITIAL_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  const completionEvidenceTime = Date.parse(LATEST_OPERATOR_EVIDENCE_CHECKED_AT) + 60_000;
  const historicalFixture = createBrowserReplayResolver(snapshot, origin, historicalEvidenceTime);
  const completionFixture = createBrowserOperatorFixtureResolver(snapshot, origin, completionEvidenceTime);
  let activeFixture = historicalFixture;
  let activeNow = historicalEvidenceTime;
  let clockScriptIdentifier;
  const sourceHash = digest(bytes);
  vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5196', '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, VITE_SCHEDULE_API_BASE: '/api' },
  });
  await new Promise((done, fail) => {
    const timer = setTimeout(() => fail(new Error('Owned Vite startup timed out')), 20000);
    let text = '';
    vite.once('error', () => { clearTimeout(timer); fail(new Error('Vite startup failed')); });
    vite.once('exit', () => { clearTimeout(timer); fail(new Error('Owned Vite exited; port may be occupied')); });
    vite.stdout.on('data', (chunk) => {
      text = (text + String(chunk)).slice(-2000);
      if (text.includes('5196')) { clearTimeout(timer); done(); }
    });
    vite.stderr.on('data', () => {});
  });
  const profile = await mkdtemp(resolve(run, 'edge-profile-'));
  edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-background-networking', '--disable-component-update',
    '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((done, fail) => {
    let text = '';
    const timer = setTimeout(() => fail(new Error('Isolated Edge startup timed out')), 15000);
    edge.once('error', () => { clearTimeout(timer); fail(new Error('Edge unavailable')); });
    edge.stderr.on('data', (chunk) => {
      text = (text + String(chunk)).slice(-2000);
      const match = text.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/);
      if (match) { clearTimeout(timer); done(match[1]); }
    });
  });
  socket = new globalThis.WebSocket(endpoint);
  await new Promise((done, fail) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', fail, { once: true }); });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const call = pending.get(message.id);
    if (!call) return;
    clearTimeout(call.timer); pending.delete(message.id);
    if (message.error) call.fail(new Error(message.error.message)); else call.done(message.result);
  });
  const target = await command('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
  const send = (method, params) => command(method, params, sessionId);
  const evaluate = async (expression) => {
    const value = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description ?? value.exceptionDetails.text);
    return value.result.value;
  };
  const waitFor = async (expression) => {
    for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await delay(100); }
    throw new Error(`Browser assertion timed out: ${expression}`);
  };
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.sessionId !== sessionId) return;
    if (message.method === 'Runtime.exceptionThrown') errors.push('Browser runtime exception');
    if (message.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = message.params;
    void (async () => {
      const result = activeFixture.resolve(request.url, request.method);
      if (result.kind === 'local-asset') await send('Fetch.continueRequest', { requestId });
      else if (result.kind === 'snapshot') {
        fulfilledQueries++;
        await send('Fetch.fulfillRequest', { requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }],
          body: Buffer.from(JSON.stringify(result.response)).toString('base64') });
      } else {
        const url = new URL(request.url);
        // index.html declares Google Fonts. Keep it blocked/offline and state
        // that these layout captures use fallback fonts; never allow a supplier.
        blocked.push(url.origin === origin ? 'unexpected-local-api'
          : url.origin === 'https://fonts.googleapis.com' && url.pathname === '/css2'
            ? 'blocked-font-style' : 'unexpected-external');
        await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      }
    })().catch(() => { errors.push('Request interception failed'); void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {}); });
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const cases = [
    { mode: 'historical', from: 'TPE', to: 'HKG', date: '2026-09-10', carrier: 'BR', number: '851', product: 'br-infinity-star-alliance-world-travel-award', copyFlight: 'CI601', evidenceText: 'EVA Air official flight status' },
    { mode: 'historical', from: 'HKG', to: 'TPE', date: '2026-09-07', carrier: 'BR', number: '852', product: 'br-infinity-star-alliance-world-travel-award', copyFlight: 'CI602', evidenceText: 'EVA Air official flight status' },
    { mode: 'historical', from: 'TPE', to: 'SFO', date: '2026-10-24', carrier: 'BR', number: '28', product: 'br-infinity-star-alliance-world-travel-award', copyFlight: 'AS7218', evidenceText: 'Chart-verified airline schedule filing' },
    { mode: 'historical', from: 'TPE', to: 'HKG', date: '2026-09-07', carrier: 'CX', number: '473', product: 'cx-asia-miles-oneworld-multi-carrier-award', copyFlight: 'JX233', evidenceText: 'Cross-source CX exact schedule' },
    { mode: 'historical', from: 'HKG', to: 'TPE', date: '2026-09-07', carrier: 'CX', number: '408', product: 'cx-asia-miles-oneworld-multi-carrier-award', copyFlight: 'JX234', evidenceText: 'Cross-source CX exact schedule' },
    { mode: 'operator-fixture', from: 'TPE', to: 'HKG', date: '2026-09-10', carrier: 'CX', number: '531', product: 'cx-asia-miles-oneworld-multi-carrier-award', copyFlight: 'CI601', evidenceText: 'Cross-source CX exact schedule', knownOtherFlight: 'CX5111', knownOtherCarrier: 'UO' },
    { mode: 'operator-fixture', from: 'HKG', to: 'TPE', date: '2026-09-10', carrier: 'CX', number: '564', product: 'cx-asia-miles-oneworld-multi-carrier-award', copyFlight: 'CI602', evidenceText: 'Cross-source CX exact schedule', knownOtherFlight: 'CX5110', knownOtherCarrier: 'UO' },
  ];
  for (const width of [1440, 1024, 390]) for (const item of cases) {
    activeFixture = item.mode === 'operator-fixture' ? completionFixture : historicalFixture;
    activeNow = item.mode === 'operator-fixture' ? completionEvidenceTime : historicalEvidenceTime;
    if (clockScriptIdentifier) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockScriptIdentifier });
    const notice = item.mode === 'operator-fixture'
      ? `SYNTHETIC-FRESHNESS OPERATOR FIXTURE · SAVED TDX ROW CONTENT · NOT supplier freshness`
      : `HISTORICAL TDX REPLAY · ${historicalFixture.capturedAt} · NOT live verification`;
    const installed = await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__qaNow = ${activeNow};
      const RealDate = Date;
      globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [window.__qaNow])); } static now() { return window.__qaNow; } };
      window.__qaCopies = [];
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { window.__qaCopies.push(text); } } });
      document.addEventListener('DOMContentLoaded', () => {
        const note = document.createElement('aside'); note.id = 'historical-replay-notice'; note.setAttribute('role', 'note');
        note.textContent = ${JSON.stringify(notice)};
        note.style.cssText = 'position:fixed;inset:auto 0 0;z-index:999999;padding:8px;background:#221b05;color:#fff4bf;font:12px sans-serif;text-align:center;pointer-events:none';
        document.body.append(note);
      });
    ` });
    clockScriptIdentifier = installed.identifier;
    const key = `${item.mode}-${item.from}-${item.to}-${item.carrier}${item.number}-${width}`;
    const hash = `#/r/v1/${item.from}-${item.to}?op=${item.carrier}&p=${item.carrier}&c=J&stp=1&d=${item.date}&rtw=${item.product}`;
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    // Hash-only navigation can reuse the old document and clipboard spy.
    // Start every case with a real document load, not a simulated SPA reload.
    await send('Page.navigate', { url: 'about:blank' });
    await waitFor('location.href === "about:blank" && !document.querySelector("[data-query-leg]")');
    await send('Page.navigate', { url: origin + '/' + hash });
    await waitFor('Boolean(document.querySelector("[data-query-leg]"))');
    const before = await evaluate('location.hash');
    await evaluate('document.querySelector("[data-query-leg]").click()');
    await waitFor('Boolean(document.querySelector(".flight-dates-query"))');
    await evaluate('document.querySelector(".flight-dates-query").click()');
    await waitFor('Boolean(document.querySelector("[data-timetable-reference], [data-published-flight]"))');
    assert.equal(await evaluate('document.querySelector(".flight-dates-results h4").textContent'), item.date, key + ' selected date');
    const start = item.date.slice(0, 7) + '-01';
    const end = item.date.slice(0, 7) + (item.date.includes('-10-') ? '-31' : '-30');
    const expected = activeFixture.resolve(`${origin}/api/schedules?from=${item.from}&to=${item.to}&start=${start}&end=${end}`).response;
    const selected = expected.days.find((day) => day.date === item.date);
    const references = selected.references ?? [];
    const published = selected.published ?? [];
    const productPublished = published.filter((flight) => flight.carrier === item.carrier);
    const actual = await evaluate('[...document.querySelectorAll("[data-timetable-reference]")].map(e=>e.dataset.timetableReference).sort()');
    assert.deepEqual(actual, references.map((f) => f.airlineCode + f.flightNumber).sort(), key + ' all designators');
    const actualPublished = await evaluate('[...document.querySelectorAll("[data-published-flight]")].map(e=>e.dataset.publishedFlight).sort()');
    assert.deepEqual(actualPublished, productPublished.map((f) => f.carrier + f.flightNumber).sort(), key + ' product-eligible verified flights');
    assert.ok(actualPublished.includes(item.carrier + item.number), key + ' target operator-verified flight');
    assert.equal(await evaluate('document.querySelectorAll("[data-flight-date][data-state=none]").length'), 0, key + ' no invented negative results');
    assert.ok(await evaluate(`document.querySelector('[data-published-flight="${item.carrier}${item.number}"]').textContent.includes(${JSON.stringify(item.evidenceText)})`), key + ' operator provenance visible');
    if (item.knownOtherFlight) {
      const knownOther = references.find((flight) => flight.airlineCode + flight.flightNumber === item.knownOtherFlight);
      assert.equal(knownOther?.operatorStatus, 'known-other-operator', key + ' known codeshare status');
      assert.equal(knownOther?.knownOperatingCarrier, item.knownOtherCarrier, key + ' known codeshare operator');
      assert.ok(await evaluate(`document.querySelector('[data-timetable-reference="${item.knownOtherFlight}"]').textContent.includes(${JSON.stringify(item.knownOtherCarrier)})`), key + ' known operator visible');
    }
    const ref = references.find((f) => f.airlineCode + f.flightNumber === item.copyFlight);
    await evaluate(`document.querySelector('[data-timetable-reference="${item.copyFlight}"] button').click()`);
    await waitFor('window.__qaCopies.length === 1');
    const text = await evaluate('window.__qaCopies[0]');
    assert.ok(text.includes(`${item.copyFlight} | ${item.from} → ${item.to}`), key + ' clipboard flight');
    assert.ok(text.includes(`${item.date} ${ref.departureTime}`), key + ' clipboard departure');
    if (ref.arrivalDate) assert.ok(text.includes(`${ref.arrivalDate} ${ref.arrivalTime}`), key + ' clipboard arrival');
    assert.ok(text.includes('https://data.gov.tw/dataset/161167'), key + ' source');
    assert.equal(await evaluate('location.hash'), before, key + ' reference copy does not modify share');
    await evaluate('document.querySelector(".flight-dates").scrollIntoView({block:"start"})');
    const metrics = await evaluate(`(() => {
      const panel=document.querySelector('.flight-dates'), grid=document.querySelector('.flight-dates-grid');
      const days=[...document.querySelectorAll('[data-flight-date]')], box=panel.getBoundingClientRect();
      return {panelLeft:box.left,panelRight:box.right,gridWidth:grid.clientWidth,gridScrollWidth:grid.scrollWidth,
        unknownDays:days.filter(e=>e.dataset.state==='unknown').length,
        overlaps:days.some((e,i)=>i>0 && Math.abs(e.getBoundingClientRect().top-days[i-1].getBoundingClientRect().top)<2 && e.getBoundingClientRect().left<days[i-1].getBoundingClientRect().right-1)};
    })()`);
    assert.ok(!metrics.overlaps && metrics.gridScrollWidth <= metrics.gridWidth + 1 && metrics.panelLeft >= -1 && metrics.panelRight <= width + 1, key + ' calendar layout');
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(run, `${key}.png`), Buffer.from(screenshot.data, 'base64'));
    if (item.to === 'SFO') {
      await evaluate('document.querySelector("[data-flight-date=\\"2026-10-25\\"]").focus()');
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
      assert.equal(await evaluate('document.querySelector(".flight-dates-results h4").textContent'), '2026-10-25', key + ' keyboard unknown date');
      assert.equal(await evaluate('document.querySelectorAll("[data-timetable-reference], [data-flight-date][data-state=none]").length'), 0);
      await evaluate('document.querySelector(".flight-dates-query").click()');
      await waitFor('document.querySelector(".flight-dates-grid").getAttribute("aria-busy")==="false"');
      assert.equal(await evaluate('document.querySelector(".flight-dates-results h4").textContent'), '2026-10-25', key + ' requery preserves unknown date');
      await evaluate(`document.querySelector('[data-flight-date="${item.date}"]').click()`);
      assert.equal(await evaluate('document.querySelector(".flight-dates-results h4").textContent'), item.date, key + ' return to verified date');
    }
    await evaluate(`document.querySelector('[data-choose-flight="${item.carrier}${item.number}:${item.date}"]').click()`);
    await waitFor(`location.hash.includes('fn=${item.number}')`);
    const selectedHash = await evaluate('location.hash');
    assert.notEqual(selectedHash, before, key + ' selection writes verified flight number');
    await send('Page.navigate', { url: 'about:blank' });
    await waitFor('location.href === "about:blank" && !document.querySelector("[data-query-leg]")');
    await send('Page.navigate', { url: origin + '/' + selectedHash });
    await waitFor(`Boolean(document.querySelector('[data-flight-number="${item.carrier}${item.number}"]'))`);
    assert.equal(await evaluate('location.hash'), selectedHash, key + ' share reload');
    checks.push({ key, mode: item.mode, selectedDate: item.date, referenceDesignators: actual.length, verifiedFlights: actualPublished.length,
      selectedFlight: item.carrier + item.number, clipboard: 'spy-verified', shareReload: true, metrics });
    console.log(`PASS ${key}: ${actualPublished.length} verified + ${actual.length} unresolved, select/share/layout`);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(blocked.filter((reason) => reason !== 'blocked-font-style'), []);
  assert.equal(digest(await readFile(input)), sourceHash, 'Original snapshot is unchanged');
  const report = { mode: 'real-edge-bounded-operator-evidence-replay', liveVerification: false, operatingCarrierAcceptance: 'bounded-evidence-with-explicit-operator-fixture',
    capturedAt: historicalFixture.capturedAt, capturedRows: historicalFixture.capturedRows, snapshotSha256: sourceHash,
    operatorEvidenceCheckedAt: OPERATOR_EVIDENCE_CHECKED_AT,
    historicalEvaluatedAt: historicalFixture.evaluatedAt,
    operatorFixtureEvaluatedAt: completionFixture.evaluatedAt,
    operatorFixtureSyntheticFreshness: completionFixture.syntheticFreshness,
    browserClock: 'per-case: historical cases use still-fresh saved TDX capture; completion cases use a synthetic-freshness operator/UI fixture and are NOT supplier freshness evidence',
    clipboard: 'stubbed-no-OS-access', scheduleResponses: 'CDP-only; no HTTP schedule server',
    fonts: 'External Google Fonts stylesheet blocked; fallback fonts only',
    blockedFontStylesheets: blocked.filter((reason) => reason === 'blocked-font-style').length,
    unexpectedRequests: blocked.filter((reason) => reason !== 'blocked-font-style').length,
    fulfilledQueries, blockedRequests: blocked.length, errors, checks, screenshotDirectory: run };
  await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Historical browser report saved: ${directory}/report.json`);
} catch (error) {
  // Exceptions contain only test assertions / controlled paths, not API bodies.
  console.error(error instanceof Error ? error.message : 'Browser smoke failed');
  process.exitCode = 1;
} finally {
  if (socket?.readyState === 1) { try { await command('Browser.close'); } catch { /* already closed */ } socket.close(); }
  for (const call of pending.values()) clearTimeout(call.timer);
  if (edge && edge.exitCode === null) edge.kill();
  if (vite && vite.exitCode === null) vite.kill();
}
