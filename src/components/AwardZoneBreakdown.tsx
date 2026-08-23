/**
 * Full-cabin award-zone breakdown for one matched pricing band
 * (docs/taiwan-first-scope.md "award-zone pricing display"). Shows every
 * cabin price the catalog actually knows for the zone the itinerary falls
 * into; unpriced cabins render as an em-dash — honest gaps from partial
 * archived charts, never guesses.
 */
import type { AwardZoneQuote } from '../lib/rtw/award-pricing.ts';
import { useLocale } from '../i18n/use-locale.ts';

const CABIN_ORDER = ['economy', 'business', 'first'] as const;
type PricedCabin = (typeof CABIN_ORDER)[number];

export function AwardZoneBreakdown({
  quote,
  activeCabin,
}: {
  readonly quote: AwardZoneQuote;
  readonly activeCabin?: PricedCabin;
}): React.ReactElement {
  const { t } = useLocale();
  const range =
    `${quote.band.minMiles.toLocaleString()}-${quote.band.maxMiles?.toLocaleString() ?? '∞'}`;
  return (
    <div className="rtw-award-zone">
      <span className="rtw-award-zone-range">{t('rtw.award.zoneLabel', { zone: range })}</span>
      <ul className="rtw-award-zone-cabins">
        {CABIN_ORDER.map((cabin) => (
          <li key={cabin} className={cabin === activeCabin ? 'active' : ''}>
            <small>{t(`rtw.award.cabin.${cabin}`)}</small>
            <strong>{quote.prices[cabin]?.toLocaleString() ?? '—'}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
