/**
 * Component tests for the award-zone breakdown strip rendered inside
 * RtwValidationPanel: every catalog-priced cabin shows its price for the
 * matched zone, unpriced cabins show an em-dash (partial archived charts
 * stay honest), and the routing's own cabin is highlighted.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AwardZoneBreakdown } from '../../src/components/AwardZoneBreakdown.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';
import type { AwardZoneQuote } from '../../src/lib/rtw/award-pricing.ts';

function quote(overrides?: Partial<AwardZoneQuote>): AwardZoneQuote {
  return {
    productId: 'fixture-product',
    label: 'Fixture product',
    confidence: 'reference-recheck',
    band: { minMiles: 20001, maxMiles: 22000 },
    prices: { economy: 95000, business: 140000, first: 205000 },
    notes: [],
    sourceUrls: ['https://example.com/chart'],
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('AwardZoneBreakdown', () => {
  it('shows the zone range and all three priced cabins', () => {
    const { container } = render(<AwardZoneBreakdown quote={quote()} />);

    expect(screen.getByText('Zone 20,001-22,000 mi')).toBeInTheDocument();
    const list = container.querySelector('.rtw-award-zone-cabins') as HTMLElement;
    expect(within(list).getByText('95,000')).toBeInTheDocument();
    expect(within(list).getByText('140,000')).toBeInTheDocument();
    expect(within(list).getByText('205,000')).toBeInTheDocument();
  });

  it('renders em-dashes for unpriced cabins instead of guessing (partial chart)', () => {
    const { container } = render(
      <AwardZoneBreakdown
        quote={quote({ band: { minMiles: 20001, maxMiles: 22000 }, prices: { business: 125000 } })}
      />,
    );

    const list = container.querySelector('.rtw-award-zone-cabins') as HTMLElement;
    expect(within(list).getByText('125,000')).toBeInTheDocument();
    expect(within(list).getAllByText('—')).toHaveLength(2);
  });

  it('renders an open-ended band with the infinity suffix', () => {
    render(
      <AwardZoneBreakdown
        quote={quote({ band: { minMiles: 0, maxMiles: null }, prices: { business: 325000 } })}
      />,
    );

    expect(screen.getByText(/0-∞/)).toBeInTheDocument();
  });

  it('highlights only the routing’s own cabin', () => {
    const { container } = render(<AwardZoneBreakdown quote={quote()} activeCabin="business" />);

    const list = container.querySelector('.rtw-award-zone-cabins') as HTMLElement;
    const business = within(list).getByText('business').closest('li') as HTMLElement;
    const economy = within(list).getByText('economy').closest('li') as HTMLElement;
    expect(business.className).toContain('active');
    expect(economy.className).not.toContain('active');
  });

  it('localizes the zone range in zh-TW (哩區間 word order after the numbers)', () => {
    setLocale('zh-TW');
    render(<AwardZoneBreakdown quote={quote()} />);

    expect(screen.getByText('20,001-22,000 哩區間')).toBeInTheDocument();
    expect(screen.getByText('經濟艙')).toBeInTheDocument();
    expect(screen.getByText('頭等艙')).toBeInTheDocument();
  });
});
