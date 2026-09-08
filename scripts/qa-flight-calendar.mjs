/** Optional Windows Edge smoke/visual capture. Uses an isolated temporary
 * profile and the local app only. No user browser/profile, supplier or seats.
 * Run Vite on 127.0.0.1:5188 first, then node scripts/qa-flight-calendar.mjs.
 * This is a bounded smoke check, not a new E2E framework. */
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Buffer } from 'node:buffer';
import process from 'node:process';

const officialMode = process.argv.includes('--official');
const results = resolve(officialMode ? 'test-results/official-flight-calendar' : 'test-results/flight-calendar');
await mkdir(results, { recursive: true });
const profile = await mkdtemp(resolve(results, 'edge-profile-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--disable-background-networking', '--disable-component-update',
  '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let socket;
const pending = new Map();
let nextId = 0;
function command(method, params = {}, sessionId) {
  const id = ++nextId;
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { pending.delete(id); fail(new Error(`CDP timeout: ${method}`)); }, 15000);
    pending.set(id, { done, fail, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}
try {
  const endpoint = await new Promise((done, fail) => {
    let output = '';
    const timer = setTimeout(() => fail(new Error('Isolated Edge did not start its debugger')), 15000);
    edge.once('error', (error) => { clearTimeout(timer); fail(error); });
    edge.stderr.on('data', (chunk) => {
      output = (output + String(chunk)).slice(-20000);
      const match = output.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/);
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
  await send('Page.enable'); await send('Runtime.enable');
  const errors = [];
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.sessionId === sessionId && message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
  });
  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  const hash = officialMode
    ? '#/r/v1/NRT-BRU?op=NH&p=BR&c=J&stp=1&d=2026-09-07&rtw=br-infinity-star-alliance-world-travel-award'
    : '#/r/v1/TPE-HKG?op=CX&p=CX&c=J&stp=1&d=2026-09-07&fn=473&rtw=cx-asia-miles-oneworld-multi-carrier-award';
  const report = [];
  for (const width of [1440, 1024, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:5188/${hash}` });
    let loaded = false;
    for (let n = 0; n < 100; n++) {
      loaded = await evaluate('Boolean(document.querySelector("[data-query-leg]"))');
      if (loaded) break;
      await new Promise((done) => setTimeout(done, 100));
    }
    if (!loaded) throw new Error('Planner did not render query controls');
    await evaluate('document.querySelector("[data-query-leg]").click()');
    await new Promise((done) => setTimeout(done, 300));
    if (officialMode) {
      await evaluate('document.querySelector(".flight-dates-query").click()');
      await new Promise((done) => setTimeout(done, 200));
      await evaluate('document.querySelector("[data-flight-date=\\"2026-09-07\\"]").click()');
      const snapshot = await evaluate('({state:document.querySelector("[data-flight-date=\\"2026-09-07\\"]").dataset.state, text:document.querySelector("[data-published-flight=\\"NH231\\"]")?.textContent})');
      if (snapshot.state !== 'published' || !snapshot.text || snapshot.text.includes('00:00')) throw new Error('Official date-only calendar did not render honestly');
      await evaluate('document.querySelector("[data-choose-flight=\\"NH231:2026-09-07\\"]").click()');
      const saved = await evaluate('location.href');
      if (!saved.includes('fn=231')) throw new Error('Published flight was not stored in share URL');
      await send('Page.navigate', { url: saved });
      for (let n = 0; n < 100; n++) {
        if (await evaluate('Boolean(document.querySelector("[data-flight-number=\\"NH231\\"]"))')) break;
        await new Promise((done) => setTimeout(done, 100));
      }
      await evaluate('document.querySelector("[data-query-leg]").click()');
      await new Promise((done) => setTimeout(done, 200));
      await evaluate('document.querySelector(".flight-dates-query").click()');
      await new Promise((done) => setTimeout(done, 200));
      await evaluate('document.querySelector("[data-flight-date=\\"2026-09-07\\"]").click()');
    }
    await evaluate('document.querySelector(".flight-dates").scrollIntoView({block:"start"})');
    const metrics = await evaluate(`(() => {
      const panel = document.querySelector('.flight-dates');
      const grid = document.querySelector('.flight-dates-grid');
      const days = [...document.querySelectorAll('[data-flight-date]')];
      const bounds = panel.getBoundingClientRect();
      return {
        width: innerWidth, bodyWidth: document.documentElement.scrollWidth,
        calendarDays: days.length, unknownDays: days.filter(day => day.dataset.state === 'unknown').length,
        publishedDays: days.filter(day => day.dataset.state === 'published').length,
        noFlightDays: days.filter(day => day.dataset.state === 'none').length,
        queryDisabled: document.querySelector('.flight-dates-query').disabled,
        savedFlight: document.querySelector('[data-flight-number]')?.dataset.flightNumber,
        panelWidth: bounds.width, panelLeft: bounds.left, panelRight: bounds.right,
        gridWidth: grid.clientWidth, gridScrollWidth: grid.scrollWidth,
        overlaps: days.some((day, i) => i > 0 && Math.abs(day.getBoundingClientRect().top-days[i-1].getBoundingClientRect().top)<2 && day.getBoundingClientRect().left < days[i-1].getBoundingClientRect().right-1)
      };
    })()`);
    if (officialMode) {
      if (metrics.calendarDays !== 30 || metrics.publishedDays !== 13 || metrics.noFlightDays !== 0 || metrics.queryDisabled || metrics.savedFlight !== 'NH231') throw new Error(`Unexpected official calendar: ${JSON.stringify(metrics)}`);
    } else if (metrics.calendarDays !== 30 || metrics.unknownDays !== 30 || !metrics.queryDisabled || metrics.savedFlight !== 'CX473') throw new Error(`Unexpected unconfigured calendar: ${JSON.stringify(metrics)}`);
    if (metrics.overlaps || metrics.gridScrollWidth > metrics.gridWidth + 1 || metrics.panelRight > width + 1 || metrics.panelLeft < -1) throw new Error(`Calendar overflow: ${JSON.stringify(metrics)}`);
    const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(results, `calendar-${width}.png`), Buffer.from(screenshot.data, 'base64'));
    report.push(metrics);
  }
  await writeFile(resolve(results, 'report.json'), JSON.stringify({ mode: officialMode ? 'real-edge-official-publications' : 'real-edge-unconfigured-provider', report, errors }, null, 2));
  console.log(JSON.stringify({ report, errors, screenshotDirectory: results }, null, 2));
  if (errors.length) throw new Error('Browser runtime errors occurred');
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
} finally {
  if (socket?.readyState === 1) { try { await command('Browser.close'); } catch { /* process may already have exited */ } socket.close(); }
  for (const call of pending.values()) clearTimeout(call.timer);
  if (edge.exitCode === null) edge.kill();
}
