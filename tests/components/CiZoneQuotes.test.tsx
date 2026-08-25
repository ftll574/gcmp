/**
 * Component tests for the per-leg CI zone-quote block (Phase-12; decision
 * record docs/decisions/ci-zone-resolution.md). Pins the honesty contract:
 * quoted legs show zone pair + active-cabin miles, unmapped endpoints show
 * 「區域未知」-class markers (never guessed zones), surface sectors are
 * labeled without a price, the segment-sum line appears only from two
 * quoted legs onward with its lower-bound caption, and zh-TW is native.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CiZoneQuotes,
  type CiZoneQuoteRow,
} from '../../src/components/CiZoneQuotes.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';

const quoted = (
  from: string,
  to: string,
  fromZone: string,
  toZone: string,
  miles: number,
): CiZoneQuoteRow => ({
  from,
  to,
  surface: false,
  quote: {
    productId: 'china-airlines-skyteam-partner-award',
    label: 'Fixture CI zone chart',
    confidence: 'published-chart',
    originRegion: fromZone,
    destinationRegion: toZone,
    cabin: 'business',
    miles,
    prices: { business: miles },
    notes: [],
    sourceUrls: ['https://example.com/ci-chart'],
  },
  fromZone,
  toZone,
});

afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('CiZoneQuotes', () => {
  it('renders quoted legs with region pairs and active-cabin miles (en)', () => {
    render(
      <CiZoneQuotes
        cabin="business"
        rows={[
          quoted('TPE', 'HKG', 'NEA', 'SEA', 60000),
          { from: 'HKG', to: 'LHR', surface: false, quote: null, fromZone: 'SEA', toZone: null },
        ]}
      />,
    );

    expect(screen.getByText('CI SkyTeam partner award · per-leg zone quotes')).toBeInTheDocument();
    expect(screen.getByText('1/2 legs resolved')).toBeInTheDocument();
    expect(screen.getByText('TPE→HKG')).toBeInTheDocument();
    expect(screen.getByText('NEA→SEA')).toBeInTheDocument();
    expect(screen.getByText('60,000')).toBeInTheDocument();
    expect(screen.getByText('Zone unknown')).toBeInTheDocument();
    // A single quoted leg ⇒ NO sum row yet.
    expect(screen.queryByText('Sum of legs')).not.toBeInTheDocument();
    // The lower-bound caption always ships (Z5).
    expect(screen.getByText(/lower-bound aid/i)).toBeInTheDocument();
  });

  it('shows the sum row only when at least two legs carry quotes', () => {
    const rows = [quoted('TPE', 'HKG', 'NEA', 'SEA', 60000), quoted('HKG', 'BKK', 'SEA', 'SWA', 35000)];
    const { rerender } = render(<CiZoneQuotes cabin="business" rows={rows} />);
    expect(screen.getByText('Sum of legs')).toBeInTheDocument();
    expect(screen.getByText('95,000')).toBeInTheDocument();

    rerender(<CiZoneQuotes cabin="business" rows={[rows[0] as CiZoneQuoteRow]} />);
    expect(screen.queryByText('Sum of legs')).not.toBeInTheDocument();
  });

  it('labels surface sectors without pricing them', () => {
    render(
      <CiZoneQuotes
        cabin="economy"
        rows={[
          { from: 'LHR', to: 'CDG', surface: true, quote: null, fromZone: null, toZone: null },
        ]}
      />,
    );

    expect(screen.getByText('LHR→CDG')).toBeInTheDocument();
    expect(screen.getByText('Surface sector — not priced')).toBeInTheDocument();
    expect(screen.queryByText(/Zone unknown/)).not.toBeInTheDocument();
  });

  it('distinguishes an unpriced CABIN on mapped zones from an unmapped zone', () => {
    render(
      <CiZoneQuotes
        cabin="economy"
        rows={[
          // NEA-SEA cell is business-only in the fixture: zones resolve but
          // economy has no price — NOT "zone unknown".
          { from: 'TPE', to: 'HKG', surface: false, quote: null, fromZone: 'NEA', toZone: 'SEA' },
        ]}
      />,
    );

    expect(screen.getByText('No economy price for this zone pair')).toBeInTheDocument();
    expect(screen.queryByText('Zone unknown')).not.toBeInTheDocument();
  });

  it('renders natively in zh-TW', () => {
    setLocale('zh-TW');
    render(
      <CiZoneQuotes
        cabin="business"
        rows={[
          quoted('TPE', 'HKG', 'NEA', 'SEA', 60000),
          quoted('HKG', 'BKK', 'SEA', 'SWA', 35000),
        ]}
      />,
    );

    expect(screen.getByText('CI SkyTeam 夥伴獎勵・逐段區域引價')).toBeInTheDocument();
    expect(screen.getByText('已解析 2/2 航段')).toBeInTheDocument();
    expect(screen.getByText('各段合計')).toBeInTheDocument();
    expect(screen.getByText('95,000')).toBeInTheDocument();
    expect(screen.getByText(/輔助下界/)).toBeInTheDocument();
  });
});
