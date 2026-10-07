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
  render(<DgcaScheduleEvidenceDirectory zh={false} />);
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByText('SpiceJet, IndiGo, and Air India')).toBeInTheDocument();
  await openDirectory();

  expect(fetch).toHaveBeenCalledTimes(1);
  expect(document.querySelector('.dgca-schedule-evidence-directory__count')).toHaveTextContent('2,931 source identity references');
  expect(screen.getByText(/4,790 source-window variants/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-indigo-domestic-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: '6E102' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-indigo-6e102-bom-del"]')!;
  expect(identity).toHaveAttribute('data-source-window', 'inside');
  expect(identity).toHaveTextContent('6E102');
  expect(identity).toHaveTextContent('BOM → DEL');
  expect(identity).toHaveTextContent('service on that date and actual operation remain unknown');
  expect(identity.querySelectorAll('button')).toHaveLength(0);

  const variantDisclosure = identity.querySelector<HTMLDetailsElement>('details')!;
  variantDisclosure.open = true;
  fireEvent(variantDisclosure, new Event('toggle'));
  expect(identity).toHaveTextContent('Raw source frequency');
  expect(identity).toHaveTextContent('21:15');
  expect(identity).toHaveTextContent('23:30');
  expect(identity).toHaveTextContent('p048/line027/station=Delhi/row=732/sha256=026970a78d37');
  expect(identity).toHaveTextContent('physical row 27');
  expect(identity).toHaveTextContent('printed row 732');
  expect(identity).toHaveTextContent('row SHA-256 026970a78d37f12e1bdd92f08f4d32296591312bb042d8568a782357e0559a2a');
  expect(identity).toHaveTextContent(/IGO operator code/);

  fireEvent.change(screen.getByLabelText('Source identity-window date (not flight availability)'), { target: { value: '2027-01-01' } });
  await waitFor(() => expect(identity).toHaveAttribute('data-source-window', 'outside'));
  expect(identity).toHaveTextContent('does not prove no flight exists');
});

test('preserves SpiceJet source lineage, one-sided wording, source attribution and hash disclosures', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  render(<DgcaScheduleEvidenceDirectory zh={false} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-spicejet-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: 'SG105' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-spicejet-ss26-sg105-del-pnq"]')!;
  expect(identity).toHaveTextContent('DEL → PNQ');
  expect(identity.querySelectorAll('button')).toHaveLength(0);
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
  expect(screen.getAllByRole('link', { name: 'Open original DGCA PDF' })).toHaveLength(3);
  expect(screen.getByRole('link', { name: 'Source attribution independently cross-checked' })).toHaveAttribute('href', 'https://www.iata.org/en/about/members/airline-list/spicejet/532/');
  expect(screen.getAllByText(/Carrier identity unresolved by the DGCA source/)).toHaveLength(2);
});

test('keeps Air India suffixes, exact page-section lineage and baseline identity classes visible', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(asset)));
  render(<DgcaScheduleEvidenceDirectory zh={false} />);
  await openDirectory();
  fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'dgca-air-india-domestic-ss-2026' } });
  fireEvent.change(screen.getByLabelText('Search designator or airport code'), { target: { value: 'AI532A' } });
  fireEvent.change(screen.getByLabelText('Source identity-window date (not flight availability)'), { target: { value: '2026-10-24' } });
  await waitFor(() => expect(document.querySelectorAll('[data-dgca-reference]')).toHaveLength(1));

  const identity = document.querySelector<HTMLElement>('[data-dgca-reference="dgca-airindia-ai532a-amd-del"]')!;
  expect(identity).toHaveAttribute('data-source-window', 'inside');
  expect(identity).toHaveTextContent('AI532A');
  expect(identity).toHaveTextContent('AMD → DEL');
  expect(identity.querySelectorAll('button')).toHaveLength(0);
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
