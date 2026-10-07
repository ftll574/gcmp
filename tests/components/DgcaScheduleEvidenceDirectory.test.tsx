import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DgcaScheduleEvidenceDirectory } from '../../src/components/DgcaScheduleEvidenceDirectory.tsx';
import type { DgcaScheduleDraftReference } from '../../src/lib/schemas/dgca-schedule-evidence.ts';

const asset = readFileSync('public/data/dgca-schedule-evidence-20261007.json', 'utf8');
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openDirectory(): Promise<void> {
  const directory = document.querySelector<HTMLDetailsElement>('[data-dgca-schedule-evidence-directory] > details')!;
  directory.open = true;
  fireEvent(directory, new Event('toggle'));
  await waitFor(() => expect(screen.getByLabelText('Search designator or airport code')).toBeInTheDocument());
}

test('loads the shared evidence directory on open and filters the bounded IndiGo identity records', async () => {
  const fetch = vi.fn(async () => new Response(asset));
  vi.stubGlobal('fetch', fetch);
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={vi.fn()} />);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText('SpiceJet, IndiGo, Air India, and Air India Express')).toBeInTheDocument();
  await openDirectory();

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.dgca-schedule-evidence-directory__count')).toHaveTextContent('3,364 source identity references');
  expect(screen.getByText(/5,730 source-window variants/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-indigo-domestic-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: '6E102' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-indigo-6e102-bom-del"]')!;
  expect(identity).toHaveAttribute('data-source-window', 'inside');
  expect(identity).toHaveTextContent('6E102');
  expect(identity).toHaveTextContent('BOM → DEL');
  expect(identity).toHaveTextContent('service on that date and actual operation remain unknown');
  expect(identity.querySelector('[data-plan-dgca-reference]')).toBeInTheDocument();

  const variantDisclosure = identity.querySelector<HTMLDetailsElement>('details')!;
  variantDisclosure.open = true;
  fireEvent(variantDisclosure, new Event('toggle'));
  expect(identity).toHaveTextContent('Raw source frequency');
  expect(identity).toHaveTextContent('21:15');
  expect(identity).toHaveTextContent('23:30');
  expect(identity).toHaveTextContent('p048/line027/station=Delhi/row=732/sha256=026970a78d37');
  expect(identity).toHaveTextContent('physical row 27');
  expect(identity).toHaveTextContent('printed row 732');
  expect(identity).toHaveTextContent('lineage SHA-256 026970a78d37f12e1bdd92f08f4d32296591312bb042d8568a782357e0559a2a');
  expect(identity).toHaveTextContent(/IGO operator code/);

  fireEvent.change(screen.getByLabelText('Source identity-window date (not flight availability)'), { target: { value: '2027-01-01' } });
  await waitFor(() => expect(identity).toHaveAttribute('data-source-window', 'outside'));
  expect(identity).toHaveTextContent('does not prove no flight exists');
});

test('adds a dated, self-contained DGCA identity reference while leaving the operating airline unknown', async () => {
  const onPlanReference = vi.fn((_reference: DgcaScheduleDraftReference, _date: string) => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={onPlanReference} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-indigo-domestic-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: '6E102' } });
  await waitFor(() => expect(document.querySelector('[data-plan-dgca-reference="dgca-indigo-domestic-ss-2026:dgca-indigo-6e102-bom-del"]')).toBeInTheDocument());

  fireEvent.click(document.querySelector('[data-plan-dgca-reference="dgca-indigo-domestic-ss-2026:dgca-indigo-6e102-bom-del"]')!);
  expect(onPlanReference).toHaveBeenCalledTimes(1);
  const [reference, date] = onPlanReference.mock.calls[0]!;
  expect(date).toBe('2026-10-07');
  expect(reference.reference).toMatchObject({
    id: 'dgca-indigo-6e102-bom-del', designatorKey: '6E102', originIata: 'BOM', destinationIata: 'DEL',
    airportCatalogStatus: 'all-endpoints-present', hasVariantConflict: false,
  });
  expect(reference.source.operator).toMatchObject({ carrierIdentityStatus: 'unresolved', iataDesignator: null, icaoCode: null });
  expect(reference.reference.variants[0]).toMatchObject({ timezone: null, timeBasis: 'unknown', frequencyRaw: '1234567' });
  expect(reference.reference.variants[0]?.sourceRows[0]?.referenceRaw).toContain('Delhi');
  expect(reference.reference.variants[0]?.sourceRows[0]?.sourceRowTextSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(reference.reference.variants[0]?.conflictFields).toEqual([]);
});

test('future-only identities require a date in-window; corroborated weekday mismatches and unmapped airports cannot be added', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={vi.fn()} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-indigo-domestic-ss-2026' } });

  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: '6E114' } });
  await waitFor(() => expect(document.querySelector('[data-dgca-reference="dgca-indigo-6e114-ccu-jai"]')).toBeInTheDocument());
  const future = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-indigo-6e114-ccu-jai"]')!;
  expect(future).toHaveAttribute('data-source-window', 'outside');
  expect(future.querySelector('[data-plan-dgca-reference]')).toBeNull();
  fireEvent.change(screen.getByLabelText('Source identity-window date (not flight availability)'), { target: { value: '2026-10-24' } });
  await waitFor(() => expect(future.querySelector('[data-plan-dgca-reference]')).toBeInTheDocument());

  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: '6E108' } });
  fireEvent.change(screen.getByLabelText('Source identity-window date (not flight availability)'), { target: { value: '2026-10-16' } });
  await waitFor(() => expect(document.querySelector('[data-dgca-reference="dgca-indigo-6e108-hyd-ixc"]')).toHaveAttribute('data-source-window', 'inside'));
  const weekdayMismatch = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-indigo-6e108-hyd-ixc"]')!;
  expect(weekdayMismatch.querySelector('[data-dgca-weekday-status="weekday-not-supported"]')).toBeInTheDocument();
  expect(weekdayMismatch.querySelector('[data-plan-dgca-reference]')).toBeNull();

  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: '6E5935' } });
  fireEvent.change(screen.getByLabelText('Source identity-window date (not flight availability)'), { target: { value: '2026-10-07' } });
  await waitFor(() => expect(document.querySelector('[data-dgca-reference="dgca-indigo-6e5935-hyd-pxn"]')).toBeInTheDocument());
  const unmapped = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-indigo-6e5935-hyd-pxn"]')!;
  expect(unmapped.querySelector('[data-airport-catalog-status="unmatched"]')).toBeInTheDocument();
  expect(unmapped.querySelector('[data-plan-dgca-reference]')).toBeNull();
});

test('preserves SpiceJet source lineage, one-sided wording, source attribution and hash disclosures', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  const onPlanReference = vi.fn((_reference: DgcaScheduleDraftReference, _date: string) => undefined);
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={onPlanReference} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-spicejet-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: 'SG105' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-spicejet-ss26-sg105-del-pnq"]')!;
  expect(identity).toHaveTextContent('DEL → PNQ');
  expect(identity.querySelector('[data-plan-dgca-reference]')).toBeInTheDocument();
  expect(identity.querySelectorAll('[data-plan-dgca-reference]')).toHaveLength(1);
  fireEvent.click(identity.querySelector('[data-plan-dgca-reference]')!);
  expect(onPlanReference).toHaveBeenCalledTimes(1);
  const [draftReference, selectedDate] = onPlanReference.mock.calls[0]!;
  expect(selectedDate).toBe('2026-10-07');
  expect(draftReference.reference.variants).toHaveLength(2);
  expect(new Set(draftReference.reference.variants.map(variant => variant.id)).size).toBe(2);
  expect(draftReference.reference.variants.flatMap(variant => variant.sourceRows).length).toBeGreaterThanOrEqual(2);
  const variantDisclosure = identity.querySelector<HTMLDetailsElement>('details')!;
  variantDisclosure.open = true;
  fireEvent(variantDisclosure, new Event('toggle'));
  expect(identity).toHaveTextContent('p03:DELHI:r50');
  expect(identity).toHaveTextContent('Raw source frequency');

  const sourceDisclosure = [...document.querySelectorAll<HTMLDetailsElement>('[data-dgca-schedule-evidence-directory] details')]
    .find(details => details.querySelector('summary')?.textContent?.includes('Sources, identity qualification and attribution'))!;
  sourceDisclosure.open = true;
  fireEvent(sourceDisclosure, new Event('toggle'));
  expect(screen.getByText(/135845cb7339e567e18b8e971d6aa5537882c3e1fd8d8101b024927e2b38124b/)).toBeInTheDocument();
  expect(screen.getByText(/49202673b590051beef3873127cecf171bea73c67ac1962d0031ccbb109bcd85/)).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Open original DGCA PDF' })).toHaveLength(4);
  expect(screen.getByRole('link', { name: 'Source attribution independently cross-checked' })).toHaveAttribute('href', 'https://www.iata.org/en/about/members/airline-list/spicejet/532/');
  expect(screen.getAllByText(/Carrier identity unresolved by the DGCA source/)).toHaveLength(3);
});

test('keeps Air India suffixes, exact page-section lineage and baseline identity classes visible', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={vi.fn()} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-air-india-domestic-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: 'AI532A' } });
  fireEvent.change(screen.getByLabelText('Source identity-window date (not flight availability)'), { target: { value: '2026-10-24' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-airindia-ai532a-amd-del"]')!;
  expect(identity).toHaveAttribute('data-source-window', 'inside');
  expect(identity).toHaveTextContent('AI532A');
  expect(identity).toHaveTextContent('AMD → DEL');
  expect(identity.querySelector('[data-plan-dgca-reference]')).toBeInTheDocument();
  const variantDisclosure = identity.querySelector<HTMLDetailsElement>('details')!;
  variantDisclosure.open = true;
  fireEvent(variantDisclosure, new Event('toggle'));
  expect(identity).toHaveTextContent('physical row 29');
  expect(identity).toHaveTextContent('section 1');
  expect(identity).toHaveTextContent('sha256=107983dc72d381e6897a5a333556946adcc98daef82e954d52cec1fc402c3086');
  expect(identity).toHaveTextContent('The source lists one direction; no reverse leg is inferred');

  const sourceDisclosure = [...document.querySelectorAll<HTMLDetailsElement>('[data-dgca-schedule-evidence-directory] details')]
    .find(details => details.querySelector('summary')?.textContent?.includes('Sources, identity qualification and attribution'))!;
  sourceDisclosure.open = true;
  fireEvent(sourceDisclosure, new Event('toggle'));
  expect(screen.getByText(/baselineConfirmedDesignatorIdentities/)).toBeInTheDocument();
  expect(screen.getByText('567')).toBeInTheDocument();
  expect(screen.getByText(/Passenger\/cargo class is not stated by the source/)).toBeInTheDocument();
});

test('filters Air India Express IX evidence while retaining its source code, one-sided rows, raw clocks and overlap flags', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={vi.fn()} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-air-india-express-domestic-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: 'IX1012' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="ix-leg-2fe88655b9bd640994b0"]')!;
  expect(identity).toHaveTextContent('IX1012');
  expect(identity).toHaveTextContent('DEL → SXR');
  expect(identity).toHaveTextContent('timing flag is not a flight-identity conflict');
  const variantDisclosure = identity.querySelector<HTMLDetailsElement>('details')!;
  variantDisclosure.open = true;
  fireEvent(variantDisclosure, new Event('toggle'));
  expect(identity).toHaveTextContent('Source status as of snapshot');
  expect(identity).toHaveTextContent('Source-row text SHA-256');
  expect(identity).toHaveTextContent('one-sided');
  expect(identity).toHaveTextContent('p15/physical-row-010/section=Delhi/printed=26/source-row=DGCA-AIX-2026-R0792');
  expect(identity).toHaveTextContent('p27/physical-row-035/section=Srinagar/printed=1/source-row=DGCA-AIX-2026-R1488');
  expect(identity).toHaveTextContent('06:25');
  expect(identity).toHaveTextContent('08:00');
  expect(identity).toHaveTextContent('not a flight-identity conflict');
  expect(identity).toHaveTextContent('no reverse leg is inferred');

  const sourceDisclosure = [...document.querySelectorAll<HTMLDetailsElement>('[data-dgca-schedule-evidence-directory] details')]
    .find(details => details.querySelector('summary')?.textContent?.includes('Sources, identity qualification and attribution'))!;
  sourceDisclosure.open = true;
  fireEvent(sourceDisclosure, new Event('toggle'));
  expect(screen.getByText(/IX is distinct from AI/)).toBeInTheDocument();
  expect(screen.getAllByRole('link', { name: 'Open original DGCA PDF' }).find(link =>
    (link as HTMLAnchorElement).href.endsWith('/AirIndiaExpressLimited_SS_2026.pdf'))).toHaveAttribute('href', 'https://public-prd-dgca.s3.ap-south-1.amazonaws.com/InventoryList/airOperation/certification/scheduled/domestic/AirIndiaExpressLimited_SS_2026.pdf');
  expect(screen.getAllByRole('link', { name: 'DGCA website policy' })).toHaveLength(4);
  expect(screen.getByText(/No Creative Commons or public-domain license is claimed/)).toBeInTheDocument();
});

test('offers Retry after a failed lazy load and renders the directory after the mocked request succeeds', async () => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
    .mockResolvedValueOnce(new Response(asset));
  vi.stubGlobal('fetch', fetch);
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={vi.fn()} />);
  const directory = document.querySelector<HTMLDetailsElement>('[data-dgca-schedule-evidence-directory] > details')!;
  directory.open = true;
  fireEvent(directory, new Event('toggle'));

  expect(await screen.findByRole('alert')).toHaveTextContent('DGCA schedule evidence is temporarily unavailable.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByLabelText('Search designator or airport code')).toBeInTheDocument());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.dgca-schedule-evidence-directory__count')).toHaveTextContent('3,364 source identity references');
});
