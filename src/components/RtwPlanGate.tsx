import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import type { AllianceCatalog } from '../lib/schemas/alliance.ts';
import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { ScheduleEntry } from '../lib/schemas/flight-schedules.ts';
import type { OfficialScheduleCatalog } from '../lib/schemas/published-schedules.ts';
import type { MarketProfile } from '../lib/schemas/market.ts';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { RtwRuleSet, RtwTicketingProgram } from '../lib/schemas/rtw-rule.ts';
import type { Airport } from '../lib/types.ts';

type AllianceId = NonNullable<RtwRuleSet['alliance']>;

const ALLIANCE_ORDER: ReadonlyArray<AllianceId> = ['star', 'oneworld', 'skyteam'];
const routeDetailsCache = new Map<string, RouteNetworkCatalog>();
const LazyRouteCatalogBrowser = lazy(() =>
  import('./RouteCatalogBrowserWithOfficialSchedules.tsx').then((module) => ({
    default: module.RouteCatalogBrowserWithOfficialSchedules,
  })),
);

interface Props {
  readonly products: ReadonlyArray<RtwRuleSet>;
  readonly allianceCatalog: AllianceCatalog;
  readonly routeNetwork?: RouteNetworkCatalog | null | undefined;
  readonly routeCountsByCarrier?: ReadonlyMap<string, number> | null | undefined;
  readonly routeNetworkDetailsUrl?: string | undefined;
  readonly schedules?: ReadonlyArray<ScheduleEntry> | null | undefined;
  readonly officialSchedules?: OfficialScheduleCatalog | null | undefined;
  readonly airportLookup?: ReadonlyMap<string, Airport> | null | undefined;
  readonly countryContinents?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly countrySubregions?: ReadonlyMap<string, string> | null | undefined;
  readonly airportBrowseRegions?: ReadonlyMap<string, string> | null | undefined;
  readonly airportContinentOverrides?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly marketProfile: MarketProfile;
  readonly ticketingPrograms: ReadonlyArray<RtwTicketingProgram>;
  readonly initialProductId?: string | undefined;
  readonly onContinue: (productId: string) => void;
}

function productRules(
  product: RtwRuleSet,
  t: (key: string, params?: Record<string, string | number>) => string,
): string[] {
  const rules: string[] = [];
  if (product.limits.minFlights !== undefined) {
    rules.push(t('rtw.onboarding.minFlights', { count: product.limits.minFlights }));
  }
  if (product.limits.maxFlights !== undefined) {
    rules.push(t('rtw.limits.maxFlights', { count: product.limits.maxFlights }));
  }
  if (product.limits.minStopovers !== undefined) {
    rules.push(t('rtw.onboarding.minStopovers', { count: product.limits.minStopovers }));
  }
  if (product.limits.maxStopovers !== undefined) {
    rules.push(t('rtw.limits.maxStopovers', { count: product.limits.maxStopovers }));
  }
  if (product.limits.maxStopoversPerCity !== undefined) {
    rules.push(t('rtw.onboarding.maxStopoversPerCity', { count: product.limits.maxStopoversPerCity }));
  }
  if (product.limits.maxStopoversPerCountry !== undefined) {
    rules.push(t('rtw.onboarding.maxStopoversPerCountry', { count: product.limits.maxStopoversPerCountry }));
  }
  if (product.limits.maxVisitsPerCity !== undefined) {
    rules.push(t('rtw.onboarding.maxVisitsPerCity', { count: product.limits.maxVisitsPerCity }));
  }
  if (product.limits.maxTransfers !== undefined) {
    rules.push(t('rtw.onboarding.maxTransfers', { count: product.limits.maxTransfers }));
  }
  if (product.limits.maxTransfersPerCity !== undefined) {
    rules.push(t('rtw.onboarding.maxTransfersPerCity', { count: product.limits.maxTransfersPerCity }));
  }
  if (product.limits.maxSurfaceSectors !== undefined) {
    rules.push(t('rtw.onboarding.maxSurface', { count: product.limits.maxSurfaceSectors }));
  }
  if (product.surfaceSectorsCountAsStopovers) {
    rules.push(t('rtw.onboarding.surfaceCountsAsStopover'));
  }
  if (product.limits.maxOpenJaws !== undefined) {
    rules.push(t('rtw.onboarding.maxOpenJaws', { count: product.limits.maxOpenJaws }));
  }
  if (product.limits.maxDistanceMiles !== undefined) {
    rules.push(t('rtw.limits.distanceCap', { count: product.limits.maxDistanceMiles.toLocaleString() }));
  }
  if (product.limits.minTripDays !== undefined) {
    rules.push(t('rtw.onboarding.minTripDays', { count: product.limits.minTripDays }));
  }
  if (product.limits.maxTripMonths !== undefined) {
    rules.push(t('rtw.onboarding.maxTripMonths', { count: product.limits.maxTripMonths }));
  }
  if (product.travelEffectiveUntil !== undefined) {
    rules.push(t('rtw.onboarding.travelEffectiveUntil', { date: product.travelEffectiveUntil }));
  }
  rules.push(t(`rtw.startEnd.${product.geography.startEnd === 'same-city' ? 'sameCity' : product.geography.startEnd === 'same-country' ? 'sameCountry' : 'open'}`));
  const directionKey = product.geography.directionPolicy === 'east-or-west-continuous'
    ? 'continuous'
    : product.geography.directionPolicy === 'no-backtracking'
      ? 'noBacktracking'
      : product.geography.directionPolicy === 'iata-area-continuous'
        ? 'iataAreaContinuous'
        : product.geography.directionPolicy === 'network-required-backtracking'
          ? 'networkBacktracking'
          : 'flexible';
  rules.push(t(`rtw.onboarding.direction.${directionKey}`));
  if (product.geography.originCountryTerminalOnly === true) {
    rules.push(t('rtw.onboarding.originCountryTerminal'));
  }
  if (product.geography.originCityTerminalOnly === true) {
    rules.push(t('rtw.onboarding.originCityTerminal'));
  }
  if (product.geography.forbidOriginCountryStopovers === true) {
    rules.push(t('rtw.onboarding.noOriginCountryStopovers'));
  }
  if ((product.geography.forbidOriginCountryStopoversWhenOriginIn?.length ?? 0) > 0) {
    rules.push(t('rtw.onboarding.conditionalOriginCountryStopovers', {
      countries: product.geography.forbidOriginCountryStopoversWhenOriginIn?.join(', ') ?? '',
    }));
  }
  const oceans = [
    product.geography.requiresPacificCrossing ? t('rtw.ocean.pacific') : null,
    product.geography.requiresAtlanticCrossing ? t('rtw.ocean.atlantic') : null,
  ].filter((item): item is string => item !== null);
  if (oceans.length > 0) {
    rules.push(t('rtw.limits.crossOceans', { oceans: oceans.join(' + ') }));
  }
  if (product.geography.rejectsAtlanticAndPacificCrossing === true) {
    rules.push(t('rtw.onboarding.prohibitedBothOceans'));
  }
  if (product.geography.oceanCrossingCount !== undefined) {
    rules.push(t(`rtw.onboarding.oceanCrossing.${product.geography.oceanCrossingCount === 'once' ? 'once' : 'atLeastOnce'}`));
  }
  if (product.geography.pricingBasis !== undefined) {
    rules.push(t(`rtw.onboarding.pricingBasis.${product.geography.pricingBasis}`));
  }
  rules.push(t(`rtw.onboarding.surfaceDistance.${product.surfaceDistancePolicy === 'counts-toward-distance' ? 'counts' : 'excluded'}`));
  rules.push(t(`rtw.onboarding.openJawDistance.${product.openJawDistancePolicy === 'counts-toward-distance' ? 'counts' : 'excluded'}`));
  if (product.airlineEligibility.type === 'alliance-members') {
    rules.push(t('rtw.onboarding.eligibleAlliance', {
      alliance: t(`alliance.${product.airlineEligibility.alliance}`),
      affiliates: product.airlineEligibility.includeAffiliates
        ? t('rtw.onboarding.withAffiliates')
        : t('rtw.onboarding.membersOnly'),
    }));
  } else {
    rules.push(t('rtw.onboarding.eligibleAirlines', { airlines: product.airlineEligibility.airlines.join(', ') }));
  }
  if (product.carrierCombination) {
    rules.push(t('rtw.onboarding.multiCarrierRule', {
      without: product.carrierCombination.minCarriersWithoutTrigger,
      with: product.carrierCombination.minCarriersWithTrigger,
      trigger: product.carrierCombination.triggerCarrier,
    }));
  }
  return rules;
}

export function RtwPlanGate({
  products,
  allianceCatalog,
  routeNetwork,
  routeCountsByCarrier,
  routeNetworkDetailsUrl,
  schedules,
  officialSchedules,
  airportLookup,
  countryContinents,
  countrySubregions,
  airportBrowseRegions,
  airportContinentOverrides,
  marketProfile,
  ticketingPrograms,
  initialProductId,
  onContinue,
}: Props): React.ReactElement {
  const { locale, t } = useLocale();
  const initialProduct = products.find((product) => product.id === initialProductId);
  const [alliance, setAlliance] = useState<AllianceId | null>(initialProduct?.alliance ?? null);
  const [productId, setProductId] = useState<string | null>(initialProduct?.id ?? null);
  const [showKnownRoutes, setShowKnownRoutes] = useState(false);
  const [detailedRouteState, setDetailedRouteState] = useState<{ url: string; network: RouteNetworkCatalog } | null>(null);
  const cachedDetailedRouteNetwork = routeNetworkDetailsUrl ? routeDetailsCache.get(routeNetworkDetailsUrl) : undefined;

  useEffect(() => {
    if (!showKnownRoutes || !routeNetworkDetailsUrl || routeDetailsCache.has(routeNetworkDetailsUrl)) return;
    if (detailedRouteState?.url === routeNetworkDetailsUrl) return;
    const controller = new AbortController();
    void fetch(routeNetworkDetailsUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseRouteNetworkCatalog(await response.json());
      })
      .then((catalog) => {
        routeDetailsCache.set(routeNetworkDetailsUrl, catalog);
        setDetailedRouteState({ url: routeNetworkDetailsUrl, network: catalog });
      })
      .catch(() => {
        // The curated network remains visible as a graceful fallback.
      });
    return () => controller.abort();
  }, [showKnownRoutes, routeNetworkDetailsUrl, detailedRouteState]);

  const allianceProducts = useMemo(
    () => alliance === null ? [] : products.filter((product) => product.alliance === alliance),
    [alliance, products],
  );
  const allianceTicketingPrograms = useMemo(
    () => alliance === null ? [] : ticketingPrograms.filter((program) => program.alliance === alliance),
    [alliance, ticketingPrograms],
  );
  const rawMemberships = useMemo(
    () => alliance === null
      ? []
      : allianceCatalog.memberships.filter(
          (membership) => membership.alliance === alliance && membership.status === 'member',
        ),
    [alliance, allianceCatalog.memberships],
  );
  const memberCodes = useMemo(() => new Set(rawMemberships.map((membership) => membership.airline)), [rawMemberships]);
  const memberNames = useMemo(
    () => new Map(rawMemberships.map((membership) => [membership.airline, membership.airlineName] as const)),
    [rawMemberships],
  );
  const routeCountByCarrier = useMemo(() => {
    if (routeCountsByCarrier) return routeCountsByCarrier;
    const counts = new Map<string, number>();
    if (routeNetwork) {
      for (const route of routeNetwork.routes) {
        if (route.status !== 'published') continue;
        counts.set(route.carrier, (counts.get(route.carrier) ?? 0) + 1);
      }
      return counts;
    }
    const seen = new Set<string>();
    for (const row of schedules ?? []) {
      if (row.status !== 'operating') continue;
      const key = `${row.carrier}:${row.pair[0]}-${row.pair[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(row.carrier, (counts.get(row.carrier) ?? 0) + 1);
    }
    return counts;
  }, [routeCountsByCarrier, routeNetwork, schedules]);
  const knownRouteCount = useMemo(
    () => [...memberCodes].reduce((sum, carrier) => sum + (routeCountByCarrier.get(carrier) ?? 0), 0),
    [memberCodes, routeCountByCarrier],
  );
  const detailedRouteNetwork = cachedDetailedRouteNetwork
    ?? (detailedRouteState && detailedRouteState.url === routeNetworkDetailsUrl
      ? detailedRouteState.network
      : routeNetwork);
  const ticketingAirlines = useMemo(
    () => new Set(allianceTicketingPrograms.flatMap((program) => program.airlines)),
    [allianceTicketingPrograms],
  );
  const plannerAirlines = useMemo(
    () => new Set(allianceTicketingPrograms.filter((program) => program.plannerProductId).flatMap((program) => program.airlines)),
    [allianceTicketingPrograms],
  );
  const memberships = useMemo(
    () => [...rawMemberships].sort((a, b) => {
      const aPlanner = plannerAirlines.has(a.airline) ? 1 : 0;
      const bPlanner = plannerAirlines.has(b.airline) ? 1 : 0;
      if (aPlanner !== bPlanner) return bPlanner - aPlanner;
      const aRoutes = routeCountByCarrier.get(a.airline) ?? 0;
      const bRoutes = routeCountByCarrier.get(b.airline) ?? 0;
      if (aRoutes !== bRoutes) return bRoutes - aRoutes;
      return a.airlineName.localeCompare(b.airlineName);
    }),
    [rawMemberships, routeCountByCarrier, plannerAirlines],
  );
  const coveredCarrierCount = useMemo(
    () => memberships.filter((membership) => (routeCountByCarrier.get(membership.airline) ?? 0) > 0).length,
    [memberships, routeCountByCarrier],
  );
  const featuredMemberships = useMemo(() => {
    const ticketing = memberships.filter((membership) => plannerAirlines.has(membership.airline));
    const networkLeaders = memberships
      .filter((membership) => !plannerAirlines.has(membership.airline))
      .filter((membership) => (routeCountByCarrier.get(membership.airline) ?? 0) > 0)
      .slice(0, Math.max(0, 8 - ticketing.length));
    return [...ticketing, ...networkLeaders];
  }, [memberships, routeCountByCarrier, plannerAirlines]);
  const plannerTicketingPrograms = useMemo(
    () => allianceTicketingPrograms.filter((program) => program.plannerProductId !== undefined),
    [allianceTicketingPrograms],
  );
  const referenceTicketingPrograms = useMemo(
    () => allianceTicketingPrograms.filter((program) => program.plannerProductId === undefined),
    [allianceTicketingPrograms],
  );
  const selectedProduct = allianceProducts.find((product) => product.id === productId) ?? null;

  const alliances = ALLIANCE_ORDER.filter((id) =>
    products.some((product) => product.alliance === id) ||
    allianceCatalog.memberships.some((membership) => membership.alliance === id),
  );

  return (
    <main className="rtw-gate" aria-label={t('rtw.onboarding.ariaLabel')}>
      <section className="rtw-gate-intro">
        <p className="rtw-eyebrow">{t('rtw.onboarding.eyebrow')}</p>
        <h1>{t('rtw.onboarding.title')}</h1>
        <p>{t('rtw.onboarding.subtitle')}</p>
      </section>

      <section className="rtw-gate-section" aria-labelledby="rtw-gate-alliance-title">
        <div className="rtw-gate-section-head">
          <span className="rtw-gate-step">1</span>
          <div>
            <h2 id="rtw-gate-alliance-title">{t('rtw.onboarding.chooseAlliance')}</h2>
            <p>{t('rtw.onboarding.chooseAllianceHint')}</p>
          </div>
        </div>
        <div className="rtw-gate-alliances" role="group" aria-label={t('rtw.alliance')}>
          {alliances.map((id) => {
            const allianceMembers = allianceCatalog.memberships.filter(
              (membership) => membership.alliance === id && membership.status === 'member',
            );
            const allianceMemberCodes = new Set(allianceMembers.map((membership) => membership.airline));
            const routeCarrierCount = [...allianceMemberCodes]
              .filter((carrier) => (routeCountByCarrier.get(carrier) ?? 0) > 0).length;
            const memberCount = allianceMembers.length;
            const productCount = ticketingPrograms.filter((program) => program.alliance === id).length;
            return (
              <button
                key={id}
                type="button"
                data-alliance={id}
                className={`rtw-gate-alliance${alliance === id ? ' selected' : ''}`}
                aria-pressed={alliance === id}
                onClick={() => {
                  setAlliance(id);
                  setProductId(null);
                  setShowKnownRoutes(false);
                }}
              >
                <strong>{t(`alliance.${id}`)}</strong>
                <span>{t('rtw.onboarding.allianceMeta', {
                  members: memberCount,
                  routes: routeCarrierCount,
                  products: productCount,
                })}</span>
              </button>
            );
          })}
        </div>
      </section>

      {alliance !== null && (
        <>
          <section className="rtw-gate-section" aria-labelledby="rtw-gate-network-title">
            <div className="rtw-gate-section-head">
              <span className="rtw-gate-step">2</span>
              <div>
                <h2 id="rtw-gate-network-title">{t('rtw.onboarding.networkTitle')}</h2>
                <p>{t('rtw.onboarding.networkHint')}</p>
              </div>
            </div>
            <div className="rtw-gate-network-summary">
              <strong>{t('rtw.onboarding.knownRouteCount', { count: knownRouteCount })}</strong>
              <span>{t('rtw.onboarding.networkCoverage', {
                covered: coveredCarrierCount,
                members: memberships.length,
              })}</span>
            </div>
            <ul className="rtw-gate-carriers">
              {featuredMemberships.map((membership) => {
                const count = routeCountByCarrier.get(membership.airline) ?? 0;
                const hasPlanner = plannerAirlines.has(membership.airline);
                const hasReference = ticketingAirlines.has(membership.airline);
                return (
                  <li key={membership.airline}>
                    <strong>{membership.airline}</strong>
                    <span>{membership.airlineName}</span>
                    <small>{t('rtw.onboarding.carrierRoutes', { count })}</small>
                    <em className={hasPlanner ? 'has-product' : hasReference ? 'has-reference' : 'no-product'}>
                      {t(hasPlanner
                        ? 'rtw.onboarding.plannerReady'
                        : hasReference
                          ? 'rtw.onboarding.hasRuleReference'
                          : 'rtw.onboarding.noRuleProduct')}
                    </em>
                  </li>
                );
              })}
            </ul>
            {memberships.length > featuredMemberships.length && (
              <details className="rtw-gate-members">
                <summary>{t('rtw.onboarding.showAllMembers', { count: memberships.length })}</summary>
                <div className="rtw-gate-member-list">
                  {memberships.map((membership) => (
                    <span key={membership.airline}>
                      <strong>{membership.airline}</strong>
                      {membership.airlineName}
                    </span>
                  ))}
                </div>
              </details>
            )}
            <details
              className="rtw-gate-routes"
              open={showKnownRoutes}
              onToggle={(event) => setShowKnownRoutes(event.currentTarget.open)}
            >
              <summary>{t('rtw.onboarding.showKnownRoutes')}</summary>
              {showKnownRoutes && (
                <Suspense fallback={null}>
                  <LazyRouteCatalogBrowser
                    routeNetwork={detailedRouteNetwork}
                    schedules={schedules}
                    officialSchedules={officialSchedules}
                    memberCodes={memberCodes}
                    airports={airportLookup}
                    countryContinents={countryContinents}
                    countrySubregions={countrySubregions}
                    airportBrowseRegions={airportBrowseRegions}
                    airportContinentOverrides={airportContinentOverrides}
                    carrierNames={memberNames}
                  />
                </Suspense>
              )}
            </details>
          </section>

          <section className="rtw-gate-section" aria-labelledby="rtw-gate-product-title">
            <div className="rtw-gate-section-head">
              <span className="rtw-gate-step">3</span>
              <div>
                <h2 id="rtw-gate-product-title">{t('rtw.onboarding.productTitle')}</h2>
                <p>{t('rtw.onboarding.productHint')}</p>
              </div>
            </div>
            {allianceTicketingPrograms.length === 0 && (
              <div className="rtw-gate-no-products" role="status">
                <strong>{t('rtw.onboarding.noTicketingProducts')}</strong>
                <span>{t('rtw.onboarding.noTicketingProductsHint')}</span>
              </div>
            )}
            <div className="rtw-gate-products">
              {plannerTicketingPrograms.map((program) => {
                const product = allianceProducts.find((candidate) => candidate.id === program.plannerProductId);
                if (!product) return null;
                const selected = product.id === productId;
                const issuer = program.airlines
                  .map((airline) => allianceCatalog.memberships.find((membership) => membership.airline === airline)?.airlineName ?? airline)
                  .join(' / ');
                const relevance = marketProfile.priorityPrograms.find((entry) => entry.id === product.id)?.rtwRelevance;
                return (
                  <article key={program.id} data-ticketing-program-id={program.id} className={`rtw-gate-product${selected ? ' selected' : ''}`}>
                    <button
                      type="button"
                      data-product-id={product.id}
                      className="rtw-gate-product-choice"
                      aria-pressed={selected}
                      onClick={() => setProductId(product.id)}
                    >
                      <span className="rtw-gate-product-topline">
                        <strong>{issuer}</strong>
                        <em className={`rtw-gate-status ${product.status}`}>{t(`rtw.onboarding.status.${product.status}`)}</em>
                      </span>
                      <span className="rtw-gate-product-name">{program.programName}</span>
                      <span className="rtw-gate-product-kind">
                        {t(`rtw.onboarding.ticketingScope.${program.scope}`)} · {t('rtw.onboarding.plannerSupported')}
                        {relevance ? ` · ${t(`rtw.onboarding.relevance.${relevance}`)}` : ''}
                      </span>
                      <ul className="rtw-gate-ticketing-rules">
                        {program.keyRules.map((rule) => <li key={rule.en}>{locale === 'zh-TW' ? rule.zhTW : rule.en}</li>)}
                      </ul>
                      <ul className="rtw-gate-rule-list">
                        {productRules(product, t).map((rule) => <li key={rule}>{rule}</li>)}
                      </ul>
                      {product.bookingStatusNote && <span className="rtw-gate-product-note">{product.bookingStatusNote}</span>}
                    </button>
                    <div className="rtw-gate-sources">
                      {program.sourceUrls.map((url, index) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer">
                          {t('rtw.onboarding.sourceN', { n: index + 1 })}
                        </a>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
            {referenceTicketingPrograms.length > 0 && (
              <details className="rtw-gate-reference-programs">
                <summary>{t('rtw.onboarding.showReferencePrograms', { count: referenceTicketingPrograms.length })}</summary>
                <div className="rtw-gate-reference-list">
                  {referenceTicketingPrograms.map((program) => (
                    <article key={program.id} data-ticketing-program-id={program.id} className="rtw-gate-reference-card">
                      <div className="rtw-gate-product-topline">
                        <strong>{program.airlines.join(' / ')}</strong>
                        <em className={`rtw-gate-status ${program.status}`}>{t(`rtw.onboarding.ticketingStatus.${program.status}`)}</em>
                      </div>
                      <h3>{program.programName}</h3>
                      <p>{t(`rtw.onboarding.ticketingScope.${program.scope}`)} · {t('rtw.onboarding.referenceOnly')}</p>
                      <ul>
                        {program.keyRules.map((rule) => <li key={rule.en}>{locale === 'zh-TW' ? rule.zhTW : rule.en}</li>)}
                      </ul>
                      <div className="rtw-gate-sources">
                        {program.sourceUrls.map((url, index) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer">{t('rtw.onboarding.sourceN', { n: index + 1 })}</a>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </details>
            )}
            <p className="rtw-gate-catalog-note">{t('rtw.onboarding.catalogNote')}</p>
          </section>
        </>
      )}

      <footer className="rtw-gate-footer">
        <div>
          {selectedProduct ? (
            <>
              <span>{t('rtw.onboarding.selected')}</span>
              <strong>{selectedProduct.label}</strong>
            </>
          ) : <span>{t('rtw.onboarding.selectBeforeContinue')}</span>}
        </div>
        <button
          type="button"
          data-enter-planner
          className="rtw-gate-continue"
          disabled={!selectedProduct || selectedProduct.status !== 'active'}
          onClick={() => selectedProduct && onContinue(selectedProduct.id)}
        >
          {selectedProduct?.status === 'discontinued'
            ? t('rtw.onboarding.discontinuedCannotPlan')
            : t('rtw.onboarding.enterPlanner')}
        </button>
      </footer>
    </main>
  );
}
