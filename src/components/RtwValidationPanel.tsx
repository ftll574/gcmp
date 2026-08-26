import { useMemo } from 'react';
import {
  estimateAwardPrice,
  PRICE_KEY_BY_CABIN,
  quoteAwardZone,
} from '../lib/rtw/award-pricing.ts';
import { sortMileageRedemptionRtwProductsForMarket } from '../lib/rtw/products.ts';
import { quoteCiLeg, resolveCiZone } from '../lib/rtw/ci-zones.ts';
import { fixHintForFinding } from '../lib/rtw/fix-hints.ts';
import { validateRtwRoute } from '../lib/rtw/validate.ts';
import { useLocale } from '../i18n/use-locale.ts';
import { AwardZoneBreakdown } from './AwardZoneBreakdown.tsx';
import { CiZoneQuotes, type CiZoneQuoteRow } from './CiZoneQuotes.tsx';
import {
  CHINA_AIRLINES_SKYTEAM_PRODUCT_ID,
  ChinaAirlinesNotRtwCard,
  StarluxWatchlistCard,
} from './TaiwanCarrierNotes.tsx';
import type { AwardPricingCatalog } from '../lib/schemas/award-pricing.ts';
import type { AllianceCatalog } from '../lib/schemas/alliance.ts';
import type { CiZoneMap } from '../lib/schemas/ci-zones.ts';
import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { MarketProfile } from '../lib/schemas/market.ts';
import type { NetworkGapEntry } from '../lib/schemas/network-gaps.ts';
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
  /** Network-gap watchlist; null ⇒ engine emits no gap findings. */
  readonly networkGaps: ReadonlyArray<NetworkGapEntry> | null;
  /**
   * CI station→zone map; null ⇒ the CI zone-quote block stays hidden
   * (degrade-to-null loader contract).
   */
  readonly ciZones: CiZoneMap | null;
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
  networkGaps,
  ciZones,
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

  // True open jaws = the unflown gaps between consecutive groups of a
  // multi-group routing (docs/decisions/open-jaw-distance.md D1): last
  // airport of group k → first airport of group k+1. The engine treats
  // them as DISTANCE-ONLY inputs (D4) and skips unknown codes silently.
  const openJawSectors = useMemo(() => {
    const jaws: Array<{ from: string; to: string }> = [];
    for (let k = 1; k < routing.groups.length; k++) {
      const prevLegs = routing.groups[k - 1]?.legs;
      const curLegs = routing.groups[k]?.legs;
      const from = prevLegs?.[prevLegs.length - 1]?.to;
      const to = curLegs?.[0]?.from;
      if (from !== undefined && to !== undefined) jaws.push({ from, to });
    }
    return jaws;
  }, [routing]);

  const result = useMemo(() => {
    if (!selectedProduct || legs.length === 0) return null;
    return validateRtwRoute(selectedProduct, legs, {
      airports,
      allianceCatalog,
      countryContinents: countryContinents ?? undefined,
      airportContinentOverrides: airportContinentOverrides ?? undefined,
      networkGaps: networkGaps ?? undefined,
      openJawSectors,
    }, routing);
  }, [selectedProduct, legs, airports, allianceCatalog, countryContinents, airportContinentOverrides, networkGaps, openJawSectors, routing]);
  const awardPrice = useMemo(() => {
    if (!selectedProduct || !result) return null;
    return estimateAwardPrice(
      awardPricingCatalog,
      selectedProduct.id,
      result.summary.totalDistanceMiles,
      routing.cabin,
    );
  }, [awardPricingCatalog, selectedProduct, result, routing.cabin]);
  // Zone breakdown: every cabin the matched band actually prices (honest
  // gaps for partial archived charts); independent of whether the routing's
  // own cabin is priced — an economy request on ANA's business-only chart
  // still shows the zone's business price.
  const zoneQuote = useMemo(() => {
    if (!selectedProduct || !result) return null;
    return quoteAwardZone(awardPricingCatalog, selectedProduct.id, result.summary.totalDistanceMiles);
  }, [awardPricingCatalog, selectedProduct, result]);
  const visibleFindings = useMemo(() => {
    if (!result) return [];
    const needsAttention = result.findings.filter((finding) => finding.severity !== 'pass');
    return needsAttention.length > 0 ? needsAttention : result.findings.slice(0, 2);
  }, [result]);

  // Taiwan-first carrier notes (docs/taiwan-first-scope.md): the CI caveat
  // shows when its product is picked or any leg is flown by CI; the JX
  // watchlist note always renders. The rule link fires only when the
  // engine's prohibited-ocean-combination check actually fails.
  // (Computed before the early return below — hooks ordering.)
  const ciProductSelected = selectedProduct?.id === CHINA_AIRLINES_SKYTEAM_PRODUCT_ID;
  const ciCarriersIncluded = legs.some((leg) => leg.operatingCarrier === 'CI');
  const ciOceanRuleTripped =
    result?.findings.some(
      (finding) => finding.ruleId === 'prohibited-ocean-combination' && finding.severity === 'fail',
    ) ?? false;

  // Per-leg CI zone quotes (Phase-12; docs/decisions/ci-zone-resolution.md).
  // Built only when the CI product is selected AND the zone map loaded —
  // otherwise the block stays absent entirely (no empty shell). Surface
  // legs are labeled, never quoted (Z1); unmapped endpoints surface as
  // 「區域未知」 rows instead of guesses.
  const ciProductId = selectedProduct?.id;
  const ciZoneRows: ReadonlyArray<CiZoneQuoteRow> | null = useMemo(() => {
    if (!ciProductSelected || !ciZones || ciProductId === undefined || legs.length === 0) {
      return null;
    }
    return legs.map((leg) => {
      const surface = leg.surface === true;
      if (surface) {
        return { from: leg.from, to: leg.to, surface: true, quote: null, fromZone: null, toZone: null };
      }
      const fromZone = resolveCiZone(ciZones, leg.from);
      const toZone = resolveCiZone(ciZones, leg.to);
      const quote =
        fromZone && toZone
          ? quoteCiLeg({
              catalog: awardPricingCatalog,
              productId: ciProductId,
              zoneMap: ciZones,
              fromAirport: leg.from,
              toAirport: leg.to,
              cabin: routing.cabin,
            })
          : null;
      return {
        from: leg.from,
        to: leg.to,
        surface: false,
        quote,
        fromZone: fromZone?.zone ?? null,
        toZone: toZone?.zone ?? null,
      };
    });
  }, [ciProductSelected, ciZones, ciProductId, legs, awardPricingCatalog, routing.cabin]);

  if (!selectedProduct) return <section className="rtw-panel">{t('rtw.noProducts')}</section>;

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
          {(awardPrice || zoneQuote) && (
            <div className="rtw-award-price">
              {awardPrice && (
                <>
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
                    {t(`rtw.award.cabin.${PRICE_KEY_BY_CABIN[awardPrice.cabin]}`)} · {awardPrice.band.minMiles.toLocaleString()}-
                    {awardPrice.band.maxMiles?.toLocaleString() ?? '∞'} {t('rtw.award.milesBand')}
                  </small>
                </>
              )}
              {zoneQuote && (
                <AwardZoneBreakdown
                  {...(awardPrice ? { activeCabin: awardPrice.cabin } : {})}
                  quote={zoneQuote}
                />
              )}
              {ciZoneRows && <CiZoneQuotes rows={ciZoneRows} cabin={routing.cabin} />}
              {awardPrice && (awardPrice.sourceUrls.length > 0 || awardPrice.notes.length > 0) ? (
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
              ) : null}
            </div>
          )}
          <ul className="rtw-findings">
            {visibleFindings.map((finding) => {
              // Violation fix hints v1 (docs/convergence-contract.md §3):
              // top-5 fail rules get one textual remedy; everything else
              // falls back to the plain rule message above.
              const fixHint =
                finding.severity === 'fail'
                  ? fixHintForFinding(finding, {
                      totalDistanceMiles: result.summary.totalDistanceMiles,
                      distanceCapMiles: selectedProduct.limits.maxDistanceMiles,
                    })
                  : null;
              return (
                <li key={finding.ruleId} className={`rtw-finding ${finding.severity}`}>
                  <span className="rtw-finding-severity">{finding.severity}</span>
                  <span>
                    {findingMessage(finding, t)}
                    {fixHint && (
                      <em className="rtw-fix-hint">
                        {t(fixHint.remedyKey, fixHint.remedyParams)}
                      </em>
                    )}
                  </span>
                </li>
              );
            })}
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
