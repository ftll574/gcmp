import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, test, vi } from 'vitest';
import { RtwPlanGate } from '../../src/components/RtwPlanGate.tsx';
import { AllianceCatalogSchema } from '../../src/lib/schemas/alliance.ts';
import { MarketProfileSchema } from '../../src/lib/schemas/market.ts';
import { RouteNetworkCatalogSchema } from '../../src/lib/schemas/route-network.ts';
import { RtwRuleCatalogSchema } from '../../src/lib/schemas/rtw-rule.ts';
import { isMileageRedemptionRtwProduct } from '../../src/lib/rtw/products.ts';

afterEach(cleanup);

const catalog = RtwRuleCatalogSchema.parse(JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')));
const alliances = AllianceCatalogSchema.parse(JSON.parse(readFileSync('public/data/alliances/current.json', 'utf8')));
const market = MarketProfileSchema.parse(JSON.parse(readFileSync('public/data/markets/tw/current.json', 'utf8')));
const network = RouteNetworkCatalogSchema.parse(JSON.parse(readFileSync('public/data/route-network/current.json', 'utf8')));
const products = catalog.products.filter(isMileageRedemptionRtwProduct);
const BR = 'br-infinity-star-alliance-world-travel-award';
const CX = 'cx-asia-miles-oneworld-multi-carrier-award';
const ANA = 'ana-star-alliance-rtw-award';
const airportLookup = new Map([
  ['TPE', { iata: 'TPE', name: 'Taiwan Taoyuan', city: 'Taoyuan', country: 'TW', lat: 25.08, lon: 121.23 }],
  ['BKK', { iata: 'BKK', name: 'Suvarnabhumi', city: 'Bangkok', country: 'TH', lat: 13.69, lon: 100.75 }],
  ['HKG', { iata: 'HKG', name: 'Hong Kong', city: 'Hong Kong', country: 'HK', lat: 22.31, lon: 113.92 }],
] as const);
const countryContinents = new Map([
  ['TW', 'asia'], ['TH', 'asia'], ['HK', 'asia'],
] as const);

function setup(onContinue = vi.fn()) {
  render(
    <RtwPlanGate
      products={products}
      ticketingPrograms={catalog.ticketingPrograms}
      allianceCatalog={alliances}
      routeNetwork={network}
      schedules={[]}
      airportLookup={airportLookup}
      countryContinents={countryContinents}
      marketProfile={market}
      onContinue={onContinue}
    />,
  );
  return onContinue;
}

test('starts with alliance choice and does not show product rules before an alliance is chosen', () => {
  setup();
  expect(screen.getByRole('button', { name: /Star Alliance/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Oneworld/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /SkyTeam/ })).toBeInTheDocument();
  expect(document.querySelector('[data-product-id]')).toBeNull();
  expect(screen.getByText('Choose an alliance, then select an active plan.')).toBeInTheDocument();
  expect(screen.queryByText('Cabin')).not.toBeInTheDocument();
});

test('choosing an alliance reveals member airlines, partial network coverage and its cataloged products', () => {
  setup();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="oneworld"]')!);
  expect(screen.getAllByText('Cathay Pacific').length).toBeGreaterThanOrEqual(1);
  expect(document.querySelector(`[data-product-id="${CX}"]`)).toBeInTheDocument();
  expect(document.querySelector(`[data-product-id="${BR}"]`)).toBeNull();
  expect(document.querySelector('[data-ticketing-program-id="finnair-plus-partner-awards"]')).toBeInTheDocument();
  expect(screen.getByText(/partial sourced catalog/i)).toBeInTheDocument();
  expect(screen.getByText(/directional nonstop routes cataloged/)).toBeInTheDocument();
  expect(screen.queryByText('no ticketing-plan data yet')).not.toBeInTheDocument();
  expect(screen.getByText(/members currently have route data/)).toBeInTheDocument();
});

test('planner-supported airlines are ordered ahead of reference-only members', () => {
  setup();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="oneworld"]')!);
  const rows = [...document.querySelectorAll<HTMLLIElement>('.rtw-gate-carriers li')];
  const plannerIndexes = rows
    .map((row, index) => row.querySelector('em.has-product') ? index : -1)
    .filter((index) => index >= 0);
  const referenceIndexes = rows
    .map((row, index) => row.querySelector('em.has-reference') ? index : -1)
    .filter((index) => index >= 0);
  expect(plannerIndexes.length).toBeGreaterThanOrEqual(4);
  expect(rows.map((row) => row.textContent).join(' | ')).toContain('Japan Airlines');
  expect(referenceIndexes.length).toBeGreaterThan(0);
  expect(Math.max(...plannerIndexes)).toBeLessThan(Math.min(...referenceIndexes));
});

test('route-pair details are materialized only after the disclosure is opened', async () => {
  setup();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="oneworld"]')!);
  expect(document.querySelector('.route-browser')).toBeNull();
  const details = document.querySelector<HTMLDetailsElement>('.rtw-gate-routes')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await waitFor(() => expect(document.querySelector('.route-browser')).toBeInTheDocument());
  // The new browser exposes only the first grouping level initially; airport,
  // route, carrier and flight details mount progressively as each level opens.
  expect(document.querySelector('.route-browser-continent')).toBeInTheDocument();
  expect(document.querySelector('.route-browser-airport')).toBeNull();
});

test('SkyTeam exposes the cataloged CI plan with its RTW limitation instead of implying full coverage', async () => {
  setup();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="skyteam"]')!);
  const ci = document.querySelector<HTMLButtonElement>('[data-product-id="china-airlines-skyteam-partner-award"]');
  expect(ci).toBeInTheDocument();
  expect(ci).toHaveTextContent(/not a true RTW candidate/i);
  expect(screen.getByText('0/18 members currently have route data')).toBeInTheDocument();
  const details = document.querySelector<HTMLDetailsElement>('.rtw-gate-routes')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  await waitFor(() => expect(document.querySelector('.route-browser-empty')).toBeInTheDocument());
});

test('Star route browser exposes current cataloged EVA flight numbers only after drilling into the route', async () => {
  setup();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="star"]')!);
  const details = document.querySelector<HTMLDetailsElement>('.rtw-gate-routes')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));

  await waitFor(() => expect(document.querySelector('.route-browser-continent')).toBeInTheDocument());
  const continent = document.querySelector<HTMLDetailsElement>('.route-browser-continent')!;
  continent.open = true;
  fireEvent(continent, new Event('toggle'));

  const taiwan = document.querySelector<HTMLDetailsElement>('[data-country="TW"]');
  expect(taiwan).toBeInTheDocument();
  expect(document.querySelector('[data-airport="TPE"]')).toBeNull();
  taiwan!.open = true;
  fireEvent(taiwan!, new Event('toggle'));

  const tpe = document.querySelector<HTMLDetailsElement>('[data-airport="TPE"]');
  expect(tpe).toBeInTheDocument();
  tpe!.open = true;
  fireEvent(tpe!, new Event('toggle'));

  const route = document.querySelector<HTMLDetailsElement>('[data-route="TPE-BKK"]');
  expect(route).toBeInTheDocument();
  route!.open = true;
  fireEvent(route!, new Event('toggle'));

  const br = document.querySelector<HTMLDetailsElement>('[data-carrier="BR"]');
  expect(br).toBeInTheDocument();
  expect(screen.queryByText('BR75')).not.toBeInTheDocument();
  br!.open = true;
  fireEvent(br!, new Event('toggle'));

  for (const flight of ['BR75', 'BR67', 'BR211', 'BR205', 'BR61']) {
    expect(screen.getByText(flight)).toBeInTheDocument();
  }
});

test('an active product can enter the workbench', () => {
  const onContinue = setup();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="star"]')!);
  fireEvent.click(document.querySelector<HTMLButtonElement>(`[data-product-id="${BR}"]`)!);
  const enter = document.querySelector<HTMLButtonElement>('[data-enter-planner]')!;
  expect(enter).toBeEnabled();
  fireEvent.click(enter);
  expect(onContinue).toHaveBeenCalledWith(BR);
});

test('JAL, Thai and Asiana researched RTW products are selectable planner products', () => {
  const onContinue = setup();

  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="oneworld"]')!);
  const jal = document.querySelector<HTMLButtonElement>('[data-product-id="jal-oneworld-award-ticket"]');
  expect(jal).toBeInTheDocument();
  expect(jal).toHaveTextContent(/8/);
  expect(jal).toHaveTextContent(/origin country/i);
  fireEvent.click(jal!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-enter-planner]')!);
  expect(onContinue).toHaveBeenCalledWith('jal-oneworld-award-ticket');

  // Re-render a fresh gate for Star products; onContinue itself is stateless.
  cleanup();
  setup(onContinue);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="star"]')!);
  const thai = document.querySelector<HTMLButtonElement>('[data-product-id="thai-royal-orchid-plus-star-rtw-award"]');
  const asiana = document.querySelector<HTMLButtonElement>('[data-product-id="asiana-club-star-alliance-rtw-award"]');
  expect(thai).toBeInTheDocument();
  expect(thai).toHaveTextContent(/network-required backtracking needs review/i);
  expect(asiana).toBeInTheDocument();
  expect(asiana).toHaveTextContent(/IATA areas/i);
  expect(asiana).toHaveTextContent('2026-12-16');
});

test('newly researched Iberia and Miles & More products can enter the workbench', () => {
  const onContinue = setup();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="oneworld"]')!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-product-id="iberia-club-oneworld-multi-carrier-award"]')!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-enter-planner]')!);
  expect(onContinue).toHaveBeenLastCalledWith('iberia-club-oneworld-multi-carrier-award');

  cleanup();
  setup(onContinue);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="star"]')!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-product-id="miles-more-star-alliance-world-award-flight"]')!);
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-enter-planner]')!);
  expect(onContinue).toHaveBeenLastCalledWith('miles-more-star-alliance-world-award-flight');
});

test('a discontinued historical product stays visible for comparison but cannot enter the workbench', () => {
  setup();
  fireEvent.click(document.querySelector<HTMLButtonElement>('[data-alliance="star"]')!);
  const ana = document.querySelector<HTMLButtonElement>(`[data-product-id="${ANA}"]`)!;
  expect(ana).toBeInTheDocument();
  fireEvent.click(ana);
  const enter = document.querySelector<HTMLButtonElement>('[data-enter-planner]')!;
  expect(enter).toBeDisabled();
  expect(enter).toHaveTextContent('This plan is discontinued');
});
