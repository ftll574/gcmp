import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { DgcaScheduleEvidenceDirectory } from '../../src/components/DgcaScheduleEvidenceDirectory.tsx';

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
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={() => undefined} />);
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
  expect(identity.querySelectorAll('button')).toHaveLength(1);

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

test('preserves SpiceJet source lineage, one-sided wording, source attribution and hash disclosures', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={() => undefined} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-spicejet-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: 'SG105' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-spicejet-ss26-sg105-del-pnq"]')!;
  expect(identity).toHaveTextContent('DEL → PNQ');
  expect(identity.querySelectorAll('button')).toHaveLength(1);
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
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={() => undefined} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-air-india-domestic-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: 'AI532A' } });
  fireEvent.change(screen.getByLabelText('Source identity-window date (not flight availability)'), { target: { value: '2026-10-24' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-airindia-ai532a-amd-del"]')!;
  expect(identity).toHaveAttribute('data-source-window', 'inside');
  expect(identity).toHaveTextContent('AI532A');
  expect(identity).toHaveTextContent('AMD → DEL');
  expect(identity.querySelectorAll('button')).toHaveLength(1);
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
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={() => undefined} />);
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
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={() => undefined} />);
  const directory = document.querySelector<HTMLDetailsElement>('[data-dgca-schedule-evidence-directory] > details')!;
  directory.open = true;
  fireEvent(directory, new Event('toggle'));

  expect(await screen.findByRole('alert')).toHaveTextContent('DGCA schedule evidence is temporarily unavailable.');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await waitFor(() => expect(screen.getByLabelText('Search designator or airport code')).toBeInTheDocument());
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(document.querySelector('.dgca-schedule-evidence-directory__count')).toHaveTextContent('3,364 source identity references');
});

test('adds a date-bounded draft reference while weekday and operator remain unknown', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  const onPlanReference = vi.fn();
  render(<DgcaScheduleEvidenceDirectory zh={false} onPlanReference={onPlanReference} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-air-india-express-domestic-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: 'IX1403' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="ix-leg-033ee97a60eee28872d2"]')!;
  expect(identity).toHaveAttribute('data-source-window', 'inside');
  expect(identity).toHaveTextContent('Weekday interpretation is unknown');
  expect(identity.querySelector('[data-dgca-weekday-status]')).toHaveAttribute('data-dgca-weekday-status', 'weekday-unknown');
  fireEvent.click(screen.getByRole('button', { name: /Add to draft/ }));

  expect(onPlanReference).toHaveBeenCalledTimes(1);
  const [draftReference, date] = onPlanReference.mock.calls[0]!;
  expect(date).toBe('2026-10-07');
  expect(draftReference.reference).toMatchObject({
    id: 'ix-leg-033ee97a60eee28872d2',
    designatorKey: 'IX1403',
    originIata: 'BLR',
    destinationIata: 'IXB',
  });
  expect(draftReference.reference.variants[0].sourceRows[0].sourceRowSha256).toBeTruthy();
  expect(draftReference.source.operator.carrierIdentityStatus).toBe('unresolved');
});
