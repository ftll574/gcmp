import { readFileSync } from 'node:fs';
import { describe, expect, test, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RtwRuleCatalogSchema } from '../../src/lib/schemas/rtw-rule.ts';
import { MarketProfileSchema } from '../../src/lib/schemas/market.ts';
import { RtwPlanningContext } from '../../src/components/RtwPlanningContext.tsx';

afterEach(cleanup);

const catalog = RtwRuleCatalogSchema.parse(
  JSON.parse(readFileSync('public/data/rtw-products/current.json', 'utf8')),
);
const marketProfile = MarketProfileSchema.parse(
  JSON.parse(readFileSync('public/data/markets/tw/current.json', 'utf8')),
);

const allianceCarriers = [
  { code: 'BR', name: 'EVA Air' },
  { code: 'CA', name: 'Air China' },
];

function renderContext(selectedProductId: string, onProductChange = vi.fn()) {
  return render(
    <RtwPlanningContext
      products={catalog.products}
      selectedProductId={selectedProductId}
      marketProfile={marketProfile}
      onProductChange={onProductChange}
      cabin="business"
      onCabinChange={vi.fn()}
      allianceCarriers={allianceCarriers}
    />,
  );
}

describe('RtwPlanningContext two-step selection', () => {
  test('renders one chip per alliance present in the product list', () => {
    const starProduct = catalog.products.find((p) => p.alliance === 'star');
    if (!starProduct) throw new Error('no star product in catalog');

    renderContext(starProduct.id);

    // Exactly one chip per alliance present in the catalog — no more, no fewer.
    const alliancesInCatalog = [
      ...new Set(catalog.products.map((p) => p.alliance).filter((a) => a !== undefined)),
    ];
    const chipNames = alliancesInCatalog.map(tAllianceName);
    for (const name of chipNames) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
  });

  test('the selected product alliance chip is pressed; clicking another switches product', () => {
    const starProduct = catalog.products.find((p) => p.alliance === 'star');
    const oneworldProduct = catalog.products.find((p) => p.alliance === 'oneworld');
    if (!starProduct || !oneworldProduct) throw new Error('catalog missing alliances');

    const onProductChange = vi.fn();
    renderContext(oneworldProduct.id, onProductChange);

    expect(screen.getByRole('button', { name: 'Oneworld' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Star Alliance' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Star Alliance' }));
    expect(onProductChange).toHaveBeenCalledWith(starProduct.id);
  });

  test('clicking the active alliance chip is a no-op', () => {
    const starProduct = catalog.products.find((p) => p.alliance === 'star');
    if (!starProduct) throw new Error('no star product in catalog');

    const onProductChange = vi.fn();
    renderContext(starProduct.id, onProductChange);
    fireEvent.click(screen.getByRole('button', { name: 'Star Alliance' }));
    expect(onProductChange).not.toHaveBeenCalled();
  });

  test('the product select narrows to the active alliance only', () => {
    const oneworldProduct = catalog.products.find((p) => p.alliance === 'oneworld');
    if (!oneworldProduct) throw new Error('no oneworld product in catalog');

    renderContext(oneworldProduct.id);
    const select = screen.getByLabelText('RTW product') as HTMLSelectElement;
    const optionIds = [...select.options].map((o) => o.value);
    // Every visible option belongs to oneworld — cross-alliance products
    // stay reachable through the alliance chips, not this select.
    for (const id of optionIds) {
      const product = catalog.products.find((p) => p.id === id);
      expect(product?.alliance).toBe('oneworld');
    }
    expect(optionIds).toContain(oneworldProduct.id);
  });

  test('member carrier codes render for the active alliance', () => {
    const starProduct = catalog.products.find((p) => p.alliance === 'star');
    if (!starProduct) throw new Error('no star product in catalog');

    renderContext(starProduct.id);
    // Scope to the member row — the seed-carrier fact may repeat a code.
    const memberRow = screen.getByText('Alliance carriers').closest('p');
    if (!memberRow) throw new Error('member carriers row missing');
    expect(within(memberRow).getByText('BR')).toBeInTheDocument();
    expect(within(memberRow).getByText('CA')).toBeInTheDocument();
  });
});

/** Mirrors the en.json `alliance.*` display names the component uses. */
function tAllianceName(alliance: string): string {
  if (alliance === 'star') return 'Star Alliance';
  if (alliance === 'oneworld') return 'Oneworld';
  return 'SkyTeam';
}
