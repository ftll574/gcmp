/** Full-App regressions for dated, source-qualified route references. */
import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { App } from '../../src/App.tsx';
import { DgcaScheduleDraftReferenceSchema, DgcaScheduleEvidenceCatalogSchema } from '../../src/lib/schemas/dgca-schedule-evidence.ts';
import { isSurfaceLeg } from '../../src/lib/types.ts';
import { encodeShareUrl, parseShareUrl } from '../../src/lib/url-schema.ts';
import type { RoutingRequest } from '../../src/lib/types.ts';

const catalogJson = readFileSync('public/data/dgca-schedule-evidence-20261007.json', 'utf8');
const catalog = DgcaScheduleEvidenceCatalogSchema.parse(JSON.parse(catalogJson));
const source = catalog.sources.find(candidate => candidate.id === 'dgca-indigo-domestic-ss-2026')!;
const reference = source.references.find(candidate => candidate.designatorKey === '6E102'
  && candidate.originIata === 'BOM' && candidate.destinationIata === 'DEL')!;
const draftReference = DgcaScheduleDraftReferenceSchema.parse({
  source: {
    id: source.id, title: source.title, url: source.url, pdfSha256: source.pdfSha256,
    pdfBytes: source.pdfBytes, pages: source.pages, publishedDateRaw: source.publishedDateRaw,
    checkedAt: source.checkedAt, reviewBy: source.reviewBy, reviewedSnapshotDate: source.reviewedSnapshotDate,
    attribution: source.attribution, reusePolicyUrl: source.reusePolicyUrl,
    reusePolicyStatement: source.reusePolicyStatement, operator: source.operator,
  },
  reference,
  catalogSnapshotAsOfDate: catalog.snapshotAsOfDate,
});
const request: RoutingRequest = {
  groups: [{ legs: [{ from: 'BOM', to: 'DEL', departsOn: '2026-10-07', dgcaScheduleReference: draftReference }] }],
  cabin: 'business',
  programs: ['aa-aadvantage'],
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-07T12:00:00.000Z'));
  vi.stubEnv('VITE_SCHEDULE_API_BASE', '/api');
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), window.location.origin);
    const file = join(process.cwd(), 'public', url.pathname);
    if (!url.pathname.startsWith('/data/') || !existsSync(file)) return new Response('', { status: 404 });
    return new Response(readFileSync(file, 'utf8'));
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/');
});

async function mount(hash = `#${encodeShareUrl(request)}`): Promise<void> {
  window.history.replaceState({}, '', `/${hash}`);
  render(<App />);
  await waitFor(() => expect(document.querySelector('.rtw-gate, .route-plan-bar')).not.toBeNull());
}

function control(selector: string): HTMLElement {
  const item = document.querySelector<HTMLElement>(selector);
  if (!item) throw new Error(`Missing control: ${selector}`);
  return item;
}

function currentLeg() {
  const parsed = parseShareUrl(window.location.hash);
  if (!parsed.ok) throw new Error(parsed.message);
  const leg = parsed.request.groups[0]?.legs[0];
  if (!leg || isSurfaceLeg(leg)) throw new Error('Expected a flight leg in the draft');
  return leg;
}

test('source-only DGCA route stays geographically visible and qualified through date edits, save/load, share reload and removal', async () => {
  await mount();
  await waitFor(() => expect(document.querySelector('.map-arc-active[data-map-route="BOM-DEL"]')).toBeInTheDocument());
  expect(control('[data-leg-route="BOM-DEL"]')).toHaveTextContent('BOM');
  expect(control('[data-leg-route="BOM-DEL"]')).toHaveTextContent('DEL');
  expect(control('[data-leg-route="BOM-DEL"]')).toHaveAttribute('data-leg-route', 'BOM-DEL');
  expect(control('[data-map-route="BOM-DEL"]')).toBeInTheDocument();
  expect(control('[data-dgca-reference-tag]')).toHaveTextContent('DGCA identity reference');
  expect(control('[data-rule-id="airline-eligibility"]')).toHaveClass('unknown');
  expect(control('[data-rule-id="dgca-source-reference"]')).toHaveClass('unknown');
  expect(control('[data-leg-route="BOM-DEL"]')).not.toHaveTextContent('undefined');

  const flightDetails = document.querySelector<HTMLDetailsElement>('.route-flight-details')!;
  flightDetails.open = true;
  fireEvent(flightDetails, new Event('toggle'));
  const sourceDisclosure = document.querySelector<HTMLDetailsElement>('[data-dgca-draft-reference]')!;
  sourceDisclosure.open = true;
  fireEvent(sourceDisclosure, new Event('toggle'));
  const date = control('[data-dgca-draft-date="0"]') as HTMLInputElement;
  expect(date).toHaveValue('2026-10-07');
  expect(control('[data-dgca-date-status="weekday-supported"]')).toHaveTextContent('actual operation remain unknown');
  expect(control('[data-dgca-source-review="snapshot-only"]')).toHaveTextContent('review by not provided');
  expect(sourceDisclosure).toHaveTextContent('timezone is unspecified');
  expect(sourceDisclosure).toHaveTextContent('Raw frequency: 1234567');

  fireEvent.change(date, { target: { value: '2027-04-01' } });
  expect(currentLeg()?.departsOn).toBe('2027-04-01');
  expect(control('[data-dgca-date-status="outside-window"]')).toHaveTextContent('does not prove no flight exists');
  expect(control('[data-leg-route="BOM-DEL"]')).toBeInTheDocument();
  expect(control('[data-map-route="BOM-DEL"]')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Routing name' }), { target: { value: 'DGCA BOM DEL draft' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]!);
  const savedRaw = window.localStorage.getItem('gcmp.savedRoutings.v1') ?? '';
  expect(savedRaw).toContain('DGCA BOM DEL draft');
  expect(savedRaw).toContain('dgca-indigo-6e102-bom-del');
  expect(savedRaw).toContain(draftReference.source.pdfSha256);

  const sharedHash = window.location.hash;
  cleanup();
  await mount(sharedHash);
  expect(currentLeg()).toMatchObject({ from: 'BOM', to: 'DEL', departsOn: '2027-04-01' });
  expect(currentLeg()).toHaveProperty('dgcaScheduleReference.reference.variants.0.frequencyRaw', '1234567');
  expect(control('[data-leg-route="BOM-DEL"]')).toBeInTheDocument();
  expect(control('[data-map-route="BOM-DEL"]')).toBeInTheDocument();

  const savedPanel = [...document.querySelectorAll<HTMLButtonElement>('.map-panel-button')]
    .find(button => button.textContent?.includes('Saved'));
  if (!savedPanel) throw new Error('Saved routings inspector button is unavailable');
  fireEvent.click(savedPanel);
  fireEvent.click(await screen.findByRole('button', { name: 'DGCA BOM DEL draft' }));
  expect(currentLeg()).toMatchObject({ from: 'BOM', to: 'DEL', departsOn: '2027-04-01' });
  expect(control('[data-dgca-draft-reference]')).toHaveTextContent('DGCA source identity reference');

  fireEvent.click(control('[data-leg-route="BOM-DEL"] .leg-chip-remove-destination'));
  await waitFor(() => expect(document.querySelector('[data-leg-route="BOM-DEL"]')).not.toBeInTheDocument());
  expect(document.querySelector('[data-map-route="BOM-DEL"]')).not.toBeInTheDocument();
  expect(window.location.hash).not.toContain('BOM-DEL');
}, 15_000);
