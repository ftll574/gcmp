/**
 * Component tests for the Taiwan-first carrier notes cards
 * (docs/taiwan-first-scope.md: CI "important but NOT true RTW" caveat +
 * JX STARLUX watchlist note). Rendered inside RtwValidationPanel.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CHINA_AIRLINES_SKYTEAM_PRODUCT_ID,
  ChinaAirlinesNotRtwCard,
  StarluxWatchlistCard,
} from '../../src/components/TaiwanCarrierNotes.tsx';
import { setLocale } from '../../src/i18n/i18n.ts';

const CI_LABEL = 'China Airlines · important, but not a true RTW product';
const JX_LABEL = 'STARLUX COSMILE · watchlist';

const visibleProps = { productSelected: true, carriersIncludeCi: false, ruleTripped: false };

afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('ChinaAirlinesNotRtwCard', () => {
  it('renders when the CI SkyTeam partner award product is selected', () => {
    render(<ChinaAirlinesNotRtwCard {...visibleProps} />);
    const card = screen.getByLabelText(CI_LABEL);
    expect(card).toBeInTheDocument();
  });

  it('renders when any routing leg is operated by CI, even with another product', () => {
    render(
      <ChinaAirlinesNotRtwCard productSelected={false} carriersIncludeCi={true} ruleTripped={false} />,
    );
    expect(screen.getByLabelText(CI_LABEL)).toBeInTheDocument();
  });

  it('renders nothing when neither the CI product nor a CI leg is present', () => {
    const { container } = render(
      <ChinaAirlinesNotRtwCard productSelected={false} carriersIncludeCi={false} ruleTripped={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('explains the both-oceans rejection in plain language', () => {
    render(<ChinaAirlinesNotRtwCard {...visibleProps} />);
    const card = screen.getByLabelText(CI_LABEL);
    expect(within(card).getByText(/crossing both the Pacific and the Atlantic/)).toBeInTheDocument();
    // Tone guard: helpful caveat, not an error wall — no fail-severity words.
    expect(within(card).queryByText(/^fail$/i)).not.toBeInTheDocument();
  });

  it('links to the prohibited-ocean-combination finding only when tripped', () => {
    const { rerender } = render(<ChinaAirlinesNotRtwCard {...visibleProps} ruleTripped={true} />);
    const card = screen.getByLabelText(CI_LABEL);
    expect(within(card).getByText(/trips that rule/)).toBeInTheDocument();

    rerender(<ChinaAirlinesNotRtwCard {...visibleProps} ruleTripped={false} />);
    expect(within(screen.getByLabelText(CI_LABEL)).queryByText(/trips that rule/)).not.toBeInTheDocument();
  });

  it('pins the product id used by public/data/rtw-products/current.json', () => {
    expect(CHINA_AIRLINES_SKYTEAM_PRODUCT_ID).toBe('china-airlines-skyteam-partner-award');
  });
});

describe('StarluxWatchlistCard', () => {
  it('renders with clear watchlist labeling', () => {
    render(<StarluxWatchlistCard />);
    const card = screen.getByLabelText(JX_LABEL);
    expect(card).toBeInTheDocument();
    expect(within(card).getByText(JX_LABEL)).toBeInTheDocument();
  });

  it('states no own RTW product and the Alaska-centered partner footprint', () => {
    render(<StarluxWatchlistCard />);
    const card = screen.getByLabelText(JX_LABEL);
    expect(within(card).getByText(/No STARLUX round-the-world award product exists today/)).toBeInTheDocument();
    expect(within(card).getByText(/Alaska Mileage Plan/)).toBeInTheDocument();
    // No invented availability claims: the word "available" must not appear.
    expect(within(card).queryByText(/available/i)).not.toBeInTheDocument();
  });
});

describe('carrier notes locale coverage', () => {
  it('renders Traditional Chinese copy under zh-TW', () => {
    setLocale('zh-TW');
    render(
      <>
        <ChinaAirlinesNotRtwCard {...visibleProps} />
        <StarluxWatchlistCard />
      </>,
    );
    expect(screen.getByLabelText('中華航空 · 重要，但非真正的環球票產品')).toBeInTheDocument();
    expect(screen.getByLabelText('星宇航空 COSMILE · 觀察名單')).toBeInTheDocument();
  });

  it('renders Simplified Chinese copy under zh-CN', () => {
    setLocale('zh-CN');
    render(<StarluxWatchlistCard />);
    expect(screen.getByLabelText('星宇航空 COSMILE · 观察名单')).toBeInTheDocument();
  });

  it('renders Japanese copy under ja', () => {
    setLocale('ja');
    render(<ChinaAirlinesNotRtwCard {...visibleProps} />);
    expect(screen.getByLabelText('チャイナエアライン · 重要だが真のRTW商品ではない')).toBeInTheDocument();
  });
});
