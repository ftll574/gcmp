import { useMemo } from 'react';
import { estimateAwardPrice } from '../lib/rtw/award-pricing.ts';
import { sortMileageRedemptionRtwProductsForMarket } from '../lib/rtw/products.ts';
import { validateRtwRoute } from '../lib/rtw/validate.ts';
import { useLocale } from '../i18n/use-locale.ts';
import {
  CHINA_AIRLINES_SKYTEAM_PRODUCT_ID,
  ChinaAirlinesNotRtwCard,
  StarluxWatchlistCard,
} from './TaiwanCarrierNotes.tsx';
import type { AwardPricingCatalog } from '../lib/schemas/award-pricing.ts';
import type { AllianceCatalog } from '../lib/schemas/alliance.ts';
import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { MarketProfile } from '../lib/schemas/market.ts';
import type { RtwRuleCatalog } from '../lib/schemas/rtw-rule.ts';
import type { Airport, RoutingRequest } from '../lib/types.ts';

interface RtwValidationPanelProps {
  readonly routing: RoutingRequest;
  readonly airports: ReadonlyMap<string, Airport>;
  readonly allianceCatalog: AllianceCatalog;
  readonly rtwRuleCatalog: RtwRuleCatalog;
  readonly awardPricingCatalog: AwardPricingCatalog;
  readonly marketProfile: MarketProfile;
  /** Country→continent base map; null ⇒ engine degrades to empty list. */
  readonly countryContinents: ReadonlyMap<string, ContinentId> | null;
  /** Airport-level overrides (spec §8 Q5); null ⇒ country rows only. */
  readonly airportContinentOverrides: ReadonlyMap<string, ContinentId> | null;
  readonly selectedProductId: string;
  readonly onProductChange: (productId: string) => void;
}

function flattenLegs(routing: RoutingRequest) {
  return routing.groups.flatMap((group) => group.legs);
}

function sourceLabel(sourceUrl: string): string {
  try {
    const hostname = new URL(sourceUrl).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return sourceUrl;
  }
}

function findingMessage(
  finding: { message: string; messageKey?: string; messageParams?: Readonly<Record<string, string | number>> },
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!finding.messageKey) return finding.message;
  const params = { ...(finding.messageParams ?? {}) };
  if (typeof params.oceans === 'string') {
    params.oceans = params.oceans
      .split(', ')
      .map((ocean) => t(`rtw.ocean.${ocean.toLowerCase()}`))
      .join(', ');
  }
  if (typeof params.missing === 'string') {
    params.missing = params.missing
      .split(', ')
      .map((ocean) => t(`rtw.ocean.${ocean.toLowerCase()}`))
      .join(', ');
  }
  if (typeof params.direction === 'string') {
    params.direction = t(`rtw.direction.${params.direction}`);
  }
  const translated = t(finding.messageKey, params);
  return translated === finding.messageKey ? finding.message : translated;
}

export function RtwValidationPanel({
  routing,
  airports,
  allianceCatalog,
  rtwRuleCatalog,
  awardPricingCatalog,
  marketProfile,
  countryContinents,
  airportContinentOverrides,
  selectedProductId,
  onProductChange,
}: RtwValidationPanelProps): React.ReactElement {
  const { t } = useLocale();
  const products = useMemo(
    () => sortMileageRedemptionRtwProductsForMarket(rtwRuleCatalog.products, marketProfile),
    [rtwRuleCatalog.products, marketProfile],
  );
  const selectedProduct = products.find((p) => p.id === selectedProductId) ?? products[0];
  const legs = useMemo(() => flattenLegs(routing), [routing]);

  const result = useMemo(() => {
    if (!selectedProduct || legs.length === 0) return null;
    return validateRtwRoute(selectedProduct, legs, {
      airports,
      allianceCatalog,
      countryContinents: countryContinents ?? undefined,
      airportContinentOverrides: airportContinentOverrides ?? undefined,
    }, routing);
  }, [selectedProduct, legs, airports, allianceCatalog, countryContinents, airportContinentOverrides, routing]);
  const awardPrice = useMemo(() => {
    if (!selectedProduct || !result) return null;
    return estimateAwardPrice(
      awardPricingCatalog,
      selectedProduct.id,
      result.summary.totalDistanceMiles,
      routing.cabin,
    );
  }, [awardPricingCatalog, selectedProduct, result, routing.cabin]);
  const visibleFindings = useMemo(() => {
    if (!result) return [];
    const needsAttention = result.findings.filter((finding) => finding.severity !== 'pass');
    return needsAttention.length > 0 ? needsAttention : result.findings.slice(0, 2);
  }, [result]);

  // Taiwan-first carrier notes (docs/taiwan-first-scope.md): the CI caveat
  // shows when its product is picked or any leg is flown by CI; the JX
  // watchlist note always renders. The rule link fires only when the
  // engine's prohibited-ocean-combination check actually fails.
  if (!selectedProduct) return <section className="rtw-panel">{t('rtw.noProducts')}</section>;

  const ciProductSelected = selectedProduct.id === CHINA_AIRLINES_SKYTEAM_PRODUCT_ID;
  const ciCarriersIncluded = legs.some((leg) => leg.operatingCarrier === 'CI');
  const ciOceanRuleTripped =
    result?.findings.some(
      (finding) => finding.ruleId === 'prohibited-ocean-combination' && finding.severity === 'fail',
    ) ?? false;

  return (
    <section className="rtw-panel" aria-label="RTW validation">
      <div className="rtw-panel-header">
        <div>
          <p className="rtw-eyebrow">{t('rtw.validationEyebrow')}</p>
          <h2>{t('rtw.validationTitle')}</h2>
        </div>
        <span className={`rtw-status ${result?.valid ? 'valid' : 'invalid'}`}>
          {result ? (result.valid ? t('rtw.status.valid') : t('rtw.status.invalid')) : t('rtw.status.empty')}
        </span>
      </div>

      <label className="rtw-product-picker">
        <span>{t('rtw.productShort')}</span>
        <select
          value={selectedProduct.id}
          onChange={(event) => onProductChange(event.target.value)}
        >
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.label}
              {product.status !== 'active' ? ` (${product.status})` : ''}
            </option>
          ))}
        </select>
      </label>

      {result ? (
        <>
          <div className="rtw-summary-grid">
            <div>
              <span>{t('rtw.summary.segments')}</span>
              <strong>{result.summary.flightSegments}</strong>
            </div>
            <div>
              <span>{t('rtw.summary.miles')}</span>
              <strong>{result.summary.totalDistanceMiles.toLocaleString()}</strong>
            </div>
            <div>
              <span>{t('rtw.summary.stopovers')}</span>
              <strong>
                {result.summary.knownStopovers}
                {result.summary.unknownStopovers > 0 ? `+${result.summary.unknownStopovers}?` : ''}
              </strong>
            </div>
            <div>
              <span>{t('rtw.summary.oceans')}</span>
              <strong>
                {result.summary.oceansCrossed.map((ocean) => t(`rtw.ocean.${ocean}`)).join(', ') || '—'}
              </strong>
            </div>
            <div>
              <span>{t('rtw.summary.continents')}</span>
              <strong>
                {result.summary.continentsVisited.map((c) => t(`rtw.continent.${c}`)).join(' → ') || '—'}
              </strong>
            </div>
            <div>
              <span>{t('rtw.summary.direction')}</span>
              <strong>{t(`rtw.direction.${result.summary.direction}`)}</strong>
            </div>
            <div>
              <span>{t('rtw.summary.tripDays')}</span>
              <strong>{result.summary.tripDays ?? '—'}</strong>
            </div>
          </div>
          {awardPrice && (
            <div className="rtw-award-price">
              <div className="rtw-award-price-topline">
                <span>{t('rtw.award.estimate')}</span>
                <em className={`rtw-award-confidence ${awardPrice.confidence}`}>
                  {awardPrice.confidence === 'official-fixed'
                    ? t('rtw.award.confidence.officialFixed')
                    : awardPrice.confidence === 'published-chart'
                      ? t('rtw.award.confidence.publishedChart')
                      : t('rtw.award.confidence.recheck')}
                </em>
              </div>
              <strong>{t('rtw.award.miles', { count: awardPrice.miles.toLocaleString() })}</strong>
              <small>
                {t(`rtw.award.cabin.${awardPrice.cabin}`)} · {awardPrice.band.minMiles.toLocaleString()}-
                {awardPrice.band.maxMiles?.toLocaleString() ?? '∞'} {t('rtw.award.milesBand')}
              </small>
              {(awardPrice.sourceUrls.length > 0 || awardPrice.notes.length > 0) && (
                <details className="rtw-award-sources">
                  <summary>{t('rtw.award.sources')}</summary>
                  {awardPrice.sourceUrls.length > 0 && (
                    <ul className="rtw-award-source-list">
                      {awardPrice.sourceUrls.map((sourceUrl) => (
                        <li key={sourceUrl}>
                          <a href={sourceUrl} target="_blank" rel="noreferrer">
                            {sourceLabel(sourceUrl)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {awardPrice.notes.length > 0 && (
                    <ul className="rtw-award-note-list">
                      {awardPrice.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  )}
                </details>
              )}
            </div>
          )}
          <ul className="rtw-findings">
            {visibleFindings.map((finding) => (
              <li key={finding.ruleId} className={`rtw-finding ${finding.severity}`}>
                <span className="rtw-finding-severity">{finding.severity}</span>
                <span>{findingMessage(finding, t)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rtw-empty">{t('rtw.empty')}</p>
      )}

      <ChinaAirlinesNotRtwCard
        productSelected={ciProductSelected}
        carriersIncludeCi={ciCarriersIncluded}
        ruleTripped={ciOceanRuleTripped}
      />
      <StarluxWatchlistCard />
    </section>
  );
}
