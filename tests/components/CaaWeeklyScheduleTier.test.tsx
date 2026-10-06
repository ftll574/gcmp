import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { CaaWeeklyScheduleRouteEvidence } from '../../src/components/CaaWeeklyScheduleRouteEvidence.tsx';
import { CaaWeeklyScheduleTierDirectory } from '../../src/components/CaaWeeklyScheduleTierDirectory.tsx';

const asset = readFileSync('public/data/route-network/caa-weekly-schedule-tier-20261006.json', 'utf8');
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test('route detail shows a separate schedule-only reference and does not expose flight-selection controls', async () => {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe('/data/route-network/caa-weekly-schedule-tier-20261006.json');
    return new Response(asset);
  });
  vi.stubGlobal('fetch', fetch);
  render(<CaaWeeklyScheduleRouteEvidence from="KHH" to="MNL" />);
  await waitFor(() => expect(screen.getByText('5J345')).toBeInTheDocument());
  expect(screen.getAllByText(/operator unknown/).length).toBeGreaterThan(0);
  expect(screen.getAllByText('No transit was reported in these fields; nonstop service is unconfirmed.').length).toBeGreaterThan(0);
  expect(document.querySelector('[data-caa-schedule-association="5J|5J|KHH>MNL|5J345"]')).toBeInTheDocument();
  expect(document.querySelectorAll('[data-caa-weekly-schedule-route] button')).toHaveLength(0);
  const date = document.querySelector<HTMLInputElement>('[data-caa-weekly-schedule-date]')!;
  fireEvent.change(date, { target: { value: '2026-10-07' } });
  expect(screen.getAllByText('Listed for this source date and weekday').length).toBeGreaterThan(0);
  expect(screen.getByText(/Snapshot as of 2026-10-06/)).toBeInTheDocument();
});

test('schedule directory loads on request, supports association search and links to the direction detail', async () => {
  const fetch = vi.fn(async () => new Response(asset));
  vi.stubGlobal('fetch', fetch);
  render(<CaaWeeklyScheduleTierDirectory />);
  expect(fetch).not.toHaveBeenCalled();
  const details = document.querySelector<HTMLDetailsElement>('[data-caa-weekly-schedule-directory] > details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await waitFor(() => expect(screen.getByText('488 association references')).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText('Search designator, airline or direction'), { target: { value: '5J345' } });
  expect(document.querySelector('[data-caa-weekly-schedule-entry="5J|5J|KHH>MNL|5J345"]')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View route details KHH → MNL' })).toHaveAttribute('href', '/?view=routes&entity=route&id=KHH-MNL');
  expect(screen.getAllByText(/operator unknown/).length).toBeGreaterThan(0);
  expect(document.querySelectorAll('[data-caa-weekly-schedule-directory] button')).toHaveLength(0);
});
