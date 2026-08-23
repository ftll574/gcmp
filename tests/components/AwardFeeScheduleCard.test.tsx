/**
 * Component tests for the era-pinned award fee-schedule card rendered
 * inside RtwValidationPanel: all entries render with currency amounts and
 * per-sector mile alternatives, a perMiles-less entry renders bare, and
 * zh-TW is native.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AwardFeeScheduleCard } from '../../src/components/AwardFeeScheduleCard.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';
import type { AwardFeeSchedule } from '../../src/lib/schemas/award-pricing.ts';

const schedule: AwardFeeSchedule = {
  currency: 'HKD',
  confidence: 'community-corrected',
  asOf: '2018-05',
  sourceUrls: ['https://www.ptt.cc/bbs/points/M.1526375797.A.BBB'],
  entries: [
    { type: 'date-change', baseAmount: 40, perMiles: 4000 },
    { type: 'reissue', baseAmount: 100, perMiles: 10000 },
    { type: 'refund', baseAmount: 120, perMiles: 12000 },
  ],
};

afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('AwardFeeScheduleCard', () => {
  it('renders all fee entries with currency amounts and per-sector alternatives (en)', () => {
    render(<AwardFeeScheduleCard schedule={schedule} />);

    expect(screen.getByText('Change / reissue / refund fees')).toBeInTheDocument();
    expect(screen.getByText('Date change')).toBeInTheDocument();
    expect(screen.getByText('Reissue')).toBeInTheDocument();
    expect(screen.getByText('Refund')).toBeInTheDocument();
    expect(screen.getByText('HKD 40')).toBeInTheDocument();
    expect(screen.getByText(/or 4,000 mi per sector/)).toBeInTheDocument();
    expect(screen.getByText('community-corrected')).toBeInTheDocument();
    expect(screen.getByText('Schedule as of 2018-05')).toBeInTheDocument();
  });

  it('omits the per-sector alternative when an entry carries no perMiles', () => {
    render(
      <AwardFeeScheduleCard
        schedule={{ ...schedule, entries: [{ type: 'refund', baseAmount: 120 }] }}
      />,
    );

    expect(screen.getByText('HKD 120')).toBeInTheDocument();
    expect(screen.queryByText(/per sector/)).not.toBeInTheDocument();
  });

  it('renders natively in zh-TW', () => {
    setLocale('zh-TW');
    render(<AwardFeeScheduleCard schedule={schedule} />);

    expect(screen.getByText('改票/重簽/退票費用')).toBeInTheDocument();
    expect(screen.getByText('日期變更')).toBeInTheDocument();
    expect(screen.getByText(/或每段 4,000 哩/)).toBeInTheDocument();
    expect(screen.getByText('2018-05 時點費率')).toBeInTheDocument();
  });
});
