import { useEffect, useMemo, useState } from 'react';
import { fetchLiveRoutes } from '../lib/live-route-client.ts';
import type { LiveRouteResponse } from '../lib/schemas/live-routes.ts';
import { selectedDepartureDate } from '../lib/schemas/dated-schedules.ts';
import type { ScheduleEntry } from '../lib/schemas/flight-schedules.ts';
import type { NetworkGapEntry } from '../lib/schemas/network-gaps.ts';
import type { OfficialScheduleCatalog } from '../lib/schemas/published-schedules.ts';
import { parseRouteNetworkCatalog, type RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { Airport, CabinId } from '../lib/types.ts';
import {
  buildNextLegIndex,
  flightNumberSuffix,
  type NextLegDestination,
  type NextLegMapGuide,
  type NextLegOption,
} from '../lib/rtw/next-leg-discovery.ts';
import { mergeLiveNextLegDestinations } from '../lib/rtw/live-next-leg-discovery.ts';
import { todayIso } from '../lib/rtw/schedule-days.ts';
import { cityCodeForAirport, cityCodeLabel, metropolitanAirportsFor } from '../lib/city-codes.ts';
import { findLocalizedMatches } from '../i18n/localized-cities.ts';
import { buildAirportIndex } from '../lib/airport-index.ts';
import { useLocale } from '../i18n/use-locale.ts';

import { FlightDatesPanel } from './FlightDatesPanel.tsx';

export interface ExplorerCarrier {
  readonly code: string;
  readonly name: string;
}

const routeOriginShardCache = new Map<string, RouteNetworkCatalog>();

interface DestinationsPanelProps {
  readonly airports: ReadonlyArray<Airport>;
  readonly schedules: ReadonlyArray<ScheduleEntry>;
  readonly officialSchedules?: OfficialScheduleCatalog | null;
  readonly network?: RouteNetworkCatalog | null;
  /** Optional base URL for build-time first-letter origin shards. Standalone
   * callers can omit it and keep using the supplied network directly. */
  readonly runtimeNetworkShardBaseUrl?: string | null;
  readonly networkGaps?: ReadonlyArray<NetworkGapEntry> | null;
  readonly carriers: ReadonlyArray<ExplorerCarrier>;
  readonly chainEnd?: string | undefined;
  readonly pendingIata?: string | undefined;
  readonly lookupAirport: (iata: string) => Airport | undefined;
  readonly onAddPair: (from: string, to: string, carrier: string, selection?: {
    departsOn?: string;
    flightNumber?: string;
    cabin?: CabinId;
    stopover?: boolean;
    manual?: boolean;
  }) => void;
  readonly onAddSurface: (from: string, to: string, stopover?: boolean) => void;
  readonly onMapGuideChange?: (guide: NextLegMapGuide | null) => void;
  /** Controlled destination selected from either the list or map. Undefined
   * keeps the component usable standalone in tests/embeds. */
  readonly selectedDestination?: string | null | undefined;
  readonly onDestinationChange?: (destination: string | null) => void;
  /** Test/embed override. Undefined uses the normal same-origin API; null disables live discovery. */
  readonly liveApiBase?: string | null;
}

interface FlightDraft {
  readonly origin: string;
  readonly to: string;
  readonly carrier: string;
  readonly flightNumber?: string;
  readonly cabin?: CabinId;
  readonly stopover?: boolean;
}

interface SurfaceDraft {
  readonly origin: string;
  readonly to: string;
  readonly stopover?: boolean;
}

interface ManualDraft {
  readonly origin: string;
  readonly to: string;
  readonly mode: 'flight' | 'surface';
  readonly carrier?: string;
  readonly cabin?: CabinId;
  readonly stopover?: boolean;
}

/** Source-backed next-leg discovery. A route observation never creates a
 * schedule or an award seat. Each add button names its operating carrier. */
export function DestinationsPanel({
  airports, schedules, officialSchedules = null, network = null, networkGaps = null, carriers,
  runtimeNetworkShardBaseUrl,
  chainEnd, pendingIata, lookupAirport, onAddPair, onAddSurface, onMapGuideChange,
  selectedDestination: controlledDestination,
  onDestinationChange,
  liveApiBase,
}: DestinationsPanelProps): React.ReactElement {
  const { locale, t } = useLocale();
  // Route construction is always anchored to the actual chain endpoint. The
  // discovery index therefore only needs this origin, not the global graph.
  const activeOrigin = chainEnd ?? pendingIata ?? '';
  const attachable = activeOrigin !== '' && (chainEnd === activeOrigin || pendingIata === activeOrigin);
  const [queryState, setQueryState] = useState<{ origin: string; value: string }>({ origin: '', value: '' });
  const [referenceDate, setReferenceDate] = useState(todayIso);
  const [flightTarget, setFlightTarget] = useState<{
    from: string;
    to: string;
    carrier: string;
    flightNumber?: string;
  } | null>(null);
  const [localDestination, setLocalDestination] = useState<{ origin: string; iata: string } | null>(null);
  const [flightDraft, setFlightDraft] = useState<FlightDraft | null>(null);
  const [surfaceDraft, setSurfaceDraft] = useState<SurfaceDraft | null>(null);
  const [manualQueryState, setManualQueryState] = useState<{ origin: string; value: string }>({ origin: '', value: '' });
  const [manualDraft, setManualDraft] = useState<ManualDraft | null>(null);
  const eligibleCodes = useMemo(() => new Set(carriers.map((carrier) => carrier.code)), [carriers]);
  const allKnownAirports = useMemo(() => new Set(airports.map((airport) => airport.iata)), [airports]);
  const originShardKey = /^[A-Z]/.test(activeOrigin) ? activeOrigin[0]! : '';
  const originShardUrl = runtimeNetworkShardBaseUrl && originShardKey
    ? `${runtimeNetworkShardBaseUrl.replace(/\/$/, '')}/${originShardKey}.json`
    : '';
  const [originShardState, setOriginShardState] = useState<{ url: string; network: RouteNetworkCatalog } | null>(null);
  const cachedOriginShard = originShardUrl ? routeOriginShardCache.get(originShardUrl) : undefined;
  useEffect(() => {
    if (!originShardUrl) return;
    if (routeOriginShardCache.has(originShardUrl)) return;
    const controller = new AbortController();
    void fetch(originShardUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return parseRouteNetworkCatalog(await response.json(), allKnownAirports);
      })
      .then((catalog) => {
        routeOriginShardCache.set(originShardUrl, catalog);
        setOriginShardState({ url: originShardUrl, network: catalog });
      })
      .catch(() => {
        // Curated/official/live discovery remains available if a shard fails.
      });
    return () => controller.abort();
  }, [originShardUrl, allKnownAirports]);
  const discoveryNetwork = cachedOriginShard
    ?? (originShardState?.url === originShardUrl ? originShardState.network : network);
  const index = useMemo(() => buildNextLegIndex({
    network: discoveryNetwork,
    schedules,
    ...(officialSchedules ? { officialSchedules } : {}),
    networkGaps,
    eligibleCarriers: eligibleCodes,
    referenceDate,
    knownAirports: allKnownAirports,
    ...(activeOrigin ? { origin: activeOrigin } : {}),
  }), [discoveryNetwork, schedules, officialSchedules, networkGaps, eligibleCodes, referenceDate, activeOrigin, allKnownAirports]);
  const airportsByIata = useMemo(() => new Map(airports.map((airport) => [airport.iata, airport] as const)), [airports]);
  const manualAirportIndex = useMemo(() => buildAirportIndex(airports), [airports]);
  const sameCityAirports = useMemo(() => {
    if (!activeOrigin) return [];
    const originAirport = airportsByIata.get(activeOrigin);
    const candidates = new Set(metropolitanAirportsFor(activeOrigin));
    if (originAirport?.city.trim()) {
      const city = originAirport.city.trim().toUpperCase();
      for (const airport of airports) {
        if (airport.country === originAirport.country && airport.city.trim().toUpperCase() === city) {
          candidates.add(airport.iata);
        }
      }
    }
    return [...candidates]
      .filter((iata) => iata !== activeOrigin)
      .flatMap((iata) => {
        const airport = airportsByIata.get(iata);
        return airport ? [airport] : [];
      })
      .sort((a, b) => a.iata.localeCompare(b.iata));
  }, [activeOrigin, airports, airportsByIata]);
  const liveBase = liveApiBase === undefined ? '/api' : liveApiBase;
  const [liveRouteState, setLiveRouteState] = useState<{ origin: string; response: LiveRouteResponse | null }>({ origin: '', response: null });
  useEffect(() => {
    if (!liveBase || !activeOrigin || !attachable) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    void fetchLiveRoutes(liveBase, activeOrigin, controller.signal)
      .then((response) => setLiveRouteState({ origin: activeOrigin, response }))
      .catch(() => {
        // Live discovery is an additive availability layer. Static/official
        // evidence remains fully usable when the provider or gateway is down.
      })
      .finally(() => clearTimeout(timer));
    return () => { clearTimeout(timer); controller.abort(); };
  }, [liveBase, activeOrigin, attachable]);
  const liveRoutes = liveRouteState.origin === activeOrigin ? liveRouteState.response : null;
  const originDestinations = useMemo(
    () => mergeLiveNextLegDestinations(index.get(activeOrigin) ?? [], liveRoutes, eligibleCodes, allKnownAirports),
    [index, activeOrigin, liveRoutes, eligibleCodes, allKnownAirports],
  );
  const query = queryState.origin === activeOrigin ? queryState.value : '';
  const manualQuery = manualQueryState.origin === activeOrigin ? manualQueryState.value : '';
  const manualResults = useMemo(() => manualQuery.trim()
    ? manualAirportIndex.search(manualQuery, { limit: 8, locale }).filter((result) => result.airport.iata !== activeOrigin)
    : [], [manualAirportIndex, manualQuery, locale, activeOrigin]);
  const carrierName = (code: string): string => carriers.find((carrier) => carrier.code === code)?.name ?? code;
  const liveCarrierNote = locale === 'zh-TW'
    ? '即時航網列示 · 請先查日期確認實際營運航空公司'
    : 'Live route listing · verify the operating carrier by date';
  const destinations = useMemo(() => {
    const localizedMatches = new Set(findLocalizedMatches(query.trim(), locale));
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    const countryLabel = (country: string): string => {
      const key = t(`rtw.country.${country}`);
      return key.startsWith('rtw.country.') ? country : key;
    };
    return originDestinations.filter((destination) => {
      if (destination.options.length === 0) return false;
      if (!normalizedQuery) return true;
      if (localizedMatches.has(destination.iata)) return true;
      const airport = lookupAirport(destination.iata);
      return [destination.iata, airport?.city, airport?.name, airport?.country, countryLabel(airport?.country ?? '')]
        .some((value) => value?.toLocaleLowerCase(locale).includes(normalizedQuery));
    });
  }, [originDestinations, query, lookupAirport, locale, t]);
  const optionCount = destinations.reduce((sum, destination) => sum + destination.options.length, 0);
  const selectedDestination = controlledDestination !== undefined
    ? controlledDestination
    : localDestination?.origin === activeOrigin ? localDestination.iata : null;
  const selectedRoute = selectedDestination
    ? destinations.find((destination) => destination.iata === selectedDestination)
      ?? originDestinations.find((destination) => destination.iata === selectedDestination)
      ?? null
    : null;
  const activeDraft = flightDraft
    && flightDraft.origin === activeOrigin
    && flightDraft.to === selectedRoute?.iata
    ? flightDraft
    : null;
  const activeSurfaceDraft = surfaceDraft?.origin === activeOrigin ? surfaceDraft : null;
  const activeManualDraft = manualDraft?.origin === activeOrigin ? manualDraft : null;

  function chooseDestination(iata: string | null): void {
    if (controlledDestination === undefined) {
      setLocalDestination(iata ? { origin: activeOrigin, iata } : null);
    }
    onDestinationChange?.(iata);
    setFlightDraft(null);
    setFlightTarget(null);
    setSurfaceDraft(null);
    setManualDraft(null);
  }

  function chooseSurfaceDestination(iata: string): void {
    if (controlledDestination === undefined) setLocalDestination(null);
    onDestinationChange?.(null);
    setFlightDraft(null);
    setFlightTarget(null);
    setManualDraft(null);
    setSurfaceDraft({ origin: activeOrigin, to: iata });
  }

  function renderSurfaceDraft(draft: SurfaceDraft): React.ReactElement | null {
    const from = airportsByIata.get(draft.origin);
    const to = airportsByIata.get(draft.to);
    if (!from || !to) return null;
    const metro = cityCodeForAirport(from.iata);
    return (
      <section className="rtw-next-surface-card" data-selected-surface={`${from.iata}-${to.iata}`}>
        <header>
          <div>
            <span>{t('rtw.discovery.airportChange')}</span>
            <h4><strong>{from.iata}</strong><span>⇢</span><strong>{to.iata}</strong></h4>
            <p>{metro ? (cityCodeLabel(metro) ?? from.city) : from.city} · {t('rtw.discovery.surfaceTransport')}</p>
          </div>
          <button type="button" onClick={() => setSurfaceDraft(null)}>{t('rtw.discovery.chooseOtherDestination')}</button>
        </header>
        <label className="rtw-next-draft-timing">
          <span>{t('rtw.discovery.arrivalTiming')}</span>
          <select
            value={draft.stopover === undefined ? '' : draft.stopover ? 'stopover' : 'transfer'}
            data-surface-timing={`${from.iata}-${to.iata}`}
            onChange={(event) => {
              const value = event.target.value;
              if (value === '') {
                const rest: SurfaceDraft = { ...draft };
                delete (rest as { stopover?: boolean }).stopover;
                setSurfaceDraft(rest);
              } else {
                setSurfaceDraft({ ...draft, stopover: value === 'stopover' });
              }
            }}
          >
            <option value="">{t('rtw.timing.unknown')}</option>
            <option value="transfer">{t('rtw.timing.transferLong')}</option>
            <option value="stopover">{t('rtw.timing.stopoverLong')}</option>
          </select>
          <small>{t('rtw.discovery.surfaceTimingNote')}</small>
        </label>
        <button
          type="button"
          className="rtw-next-add-later"
          data-add-surface={`${from.iata}-${to.iata}`}
          onClick={() => {
            onAddSurface(from.iata, to.iata, draft.stopover);
            setSurfaceDraft(null);
            setQueryState({ origin: activeOrigin, value: '' });
          }}
        >{t('rtw.discovery.addAirportChange')}</button>
      </section>
    );
  }

  function renderManualPlanner(): React.ReactElement {
    return (
      <details className="rtw-next-manual">
        <summary>{t('rtw.discovery.manualSegment')}</summary>
        <div className="rtw-next-manual-body">
          <p className="rtw-next-manual-warning">{t('rtw.discovery.manualSegmentWarning')}</p>
          <label className="rtw-next-manual-search">
            <span>{t('rtw.discovery.manualDestination')}</span>
            <input
              type="search"
              value={manualQuery}
              data-manual-destination-search
              onChange={(event) => {
                setManualQueryState({ origin: activeOrigin, value: event.target.value });
                setManualDraft(null);
              }}
              placeholder={t('rtw.discovery.searchPlaceholder')}
            />
          </label>
          {manualResults.length > 0 && !activeManualDraft && (
            <div className="rtw-next-manual-results">
              {manualResults.map(({ airport }) => (
                <button
                  key={airport.iata}
                  type="button"
                  data-manual-destination={airport.iata}
                  onClick={() => setManualDraft({ origin: activeOrigin, to: airport.iata, mode: 'flight' })}
                >
                  <strong>{airport.iata}</strong>
                  <span>{airport.city}</span>
                  <small>{airport.name}</small>
                </button>
              ))}
            </div>
          )}
          {activeManualDraft && (
            <div className="rtw-next-manual-draft" data-manual-draft={`${activeOrigin}-${activeManualDraft.to}`}>
              <div className="rtw-next-manual-route">
                <strong>{activeOrigin} → {activeManualDraft.to}</strong>
                <button type="button" onClick={() => setManualDraft(null)}>{t('rtw.discovery.changeManualDestination')}</button>
              </div>
              <label>
                <span>{t('rtw.discovery.segmentMode')}</span>
                <select
                  data-manual-mode
                  value={activeManualDraft.mode}
                  onChange={(event) => {
                    const mode = event.target.value as 'flight' | 'surface';
                    const next: ManualDraft = { ...activeManualDraft, mode };
                    if (mode === 'surface') {
                      delete (next as { carrier?: string }).carrier;
                      delete (next as { cabin?: CabinId }).cabin;
                    }
                    setManualDraft(next);
                  }}
                >
                  <option value="flight">{t('rtw.discovery.manualFlight')}</option>
                  <option value="surface">{t('rtw.discovery.manualSurface')}</option>
                </select>
              </label>
              {activeManualDraft.mode === 'flight' && (
                <label>
                  <span>{t('rtw.discovery.chooseAirline')}</span>
                  <select
                    data-manual-carrier
                    value={activeManualDraft.carrier ?? ''}
                    onChange={(event) => {
                      const carrier = event.target.value;
                      if (carrier) setManualDraft({ ...activeManualDraft, carrier });
                      else {
                        const next: ManualDraft = { ...activeManualDraft };
                        delete (next as { carrier?: string }).carrier;
                        setManualDraft(next);
                      }
                    }}
                  >
                    <option value="">{t('rtw.discovery.chooseAirlinePlaceholder')}</option>
                    {carriers.map((carrier) => <option key={carrier.code} value={carrier.code}>{carrier.code} · {carrier.name}</option>)}
                  </select>
                </label>
              )}
              <label>
                <span>{t('rtw.discovery.arrivalTiming')}</span>
                <select
                  data-manual-timing
                  value={activeManualDraft.stopover === undefined ? '' : activeManualDraft.stopover ? 'stopover' : 'transfer'}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === '') {
                      const next: ManualDraft = { ...activeManualDraft };
                      delete (next as { stopover?: boolean }).stopover;
                      setManualDraft(next);
                    } else setManualDraft({ ...activeManualDraft, stopover: value === 'stopover' });
                  }}
                >
                  <option value="">{t('rtw.timing.unknown')}</option>
                  <option value="transfer">{t('rtw.timing.transferLong')}</option>
                  <option value="stopover">{t('rtw.timing.stopoverLong')}</option>
                </select>
              </label>
              {activeManualDraft.mode === 'flight' && (
                <label>
                  <span>{t('rtw.discovery.chooseCabin')}</span>
                  <select
                    data-manual-cabin
                    value={activeManualDraft.cabin ?? ''}
                    onChange={(event) => {
                      const value = event.target.value as CabinId | '';
                      if (value) setManualDraft({ ...activeManualDraft, cabin: value });
                      else {
                        const next: ManualDraft = { ...activeManualDraft };
                        delete (next as { cabin?: CabinId }).cabin;
                        setManualDraft(next);
                      }
                    }}
                  >
                    <option value="">{t('rtw.legChip.cabinUnset')}</option>
                    <option value="economy">{t('cabin.economy')}</option>
                    <option value="premium-economy">{t('cabin.premiumEconomy')}</option>
                    <option value="business">{t('cabin.business')}</option>
                    <option value="first">{t('cabin.first')}</option>
                  </select>
                </label>
              )}
              <button
                type="button"
                className="rtw-next-manual-add"
                data-add-manual={`${activeOrigin}-${activeManualDraft.to}`}
                disabled={activeManualDraft.mode === 'flight' && !activeManualDraft.carrier}
                onClick={() => {
                  if (activeManualDraft.mode === 'surface') {
                    onAddSurface(activeOrigin, activeManualDraft.to, activeManualDraft.stopover);
                  } else if (activeManualDraft.carrier) {
                    onAddPair(activeOrigin, activeManualDraft.to, activeManualDraft.carrier, {
                      manual: true,
                      ...(activeManualDraft.cabin ? { cabin: activeManualDraft.cabin } : {}),
                      ...(activeManualDraft.stopover !== undefined ? { stopover: activeManualDraft.stopover } : {}),
                    });
                  } else return;
                  setManualDraft(null);
                  setManualQueryState({ origin: activeOrigin, value: '' });
                }}
              >{activeManualDraft.mode === 'surface' ? t('rtw.discovery.addManualSurface') : t('rtw.discovery.addManualFlight')}</button>
            </div>
          )}
        </div>
      </details>
    );
  }

  useEffect(() => {
    if (!onMapGuideChange) return;
    if (!attachable || activeOrigin === '') {
      onMapGuideChange(null);
      return;
    }
    onMapGuideChange({ origin: activeOrigin, destinations });
  }, [activeOrigin, attachable, destinations, onMapGuideChange]);


  function renderEvidence(option: NextLegOption): React.ReactElement {
    return (
      <details className="rtw-explorer-evidence" key={option.carrier}>
        <summary>{option.carrier} · {t('rtw.integrity.evidence')}</summary>
        <ul>
          {option.networkSources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noreferrer">{new URL(source.url).hostname}</a>
              <span>{t('rtw.discovery.checkedOn', { date: source.checkedOn })}
                {source.publishedOn && ` · ${t('rtw.discovery.publishedOn', { date: source.publishedOn })}`}
              </span>
              <span>{source.note}</span>
            </li>
          ))}
          {option.routeWindow && (option.routeWindow.from || option.routeWindow.until) && (
            <li>{option.routeWindow.from ?? '…'} – {option.routeWindow.until ?? '…'}</li>
          )}
          {option.schedules.map((entry, i) => (
            <li key={`schedule-${i}`}>
              <span>{t('rtw.discovery.scheduleEvidence')} · {entry.effectiveFrom ?? '…'} – {entry.effectiveUntil ?? '…'}
                {(entry.seasonStart || entry.seasonEnd) && ` · ${entry.seasonStart ?? '…'} – ${entry.seasonEnd ?? '…'}`}
              </span>
              {entry.sourceUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer">{new URL(url).hostname}</a>)}
            </li>
          ))}
          {option.flightNumberSources.map((source) => (
            <li key={`flight-number-source-${source.url}`}>
              <span>{t('rtw.discovery.flightNumberReference')}</span>
              <a href={source.url} target="_blank" rel="noreferrer">{new URL(source.url).hostname}</a>
              <span>{t('rtw.discovery.checkedOn', { date: source.checkedAt.slice(0, 10) })}</span>
            </li>
          ))}
        </ul>
      </details>
    );
  }

  function renderDestination(destination: NextLegDestination): React.ReactElement {
    const airport = lookupAirport(destination.iata);
    const city = airport?.city ?? '';
    return (
      <div key={destination.iata} className="rtw-next-destination" data-destination={destination.iata}>
        <button
          type="button"
          className="rtw-next-pair"
          data-select-route={`${activeOrigin}-${destination.iata}`}
          aria-label={`${activeOrigin}→${destination.iata}${city ? ` · ${city}` : ''}`}
          onClick={() => chooseDestination(destination.iata)}
        >
          <span className="rtw-next-pair-route"><strong>{activeOrigin}</strong><span>→</span><strong>{destination.iata}</strong></span>
          <span className="rtw-next-pair-city">{city}</span>
          <small>{t('rtw.discovery.operatorCount', { count: destination.options.length })}</small>
        </button>
      </div>
    );
  }

  function renderSelectedRoute(destination: NextLegDestination): React.ReactElement {
    const airport = lookupAirport(destination.iata);
    const city = airport?.city ?? '';
    return (
      <section className="rtw-next-selected-route" data-selected-route={`${activeOrigin}-${destination.iata}`}>
        <header className="rtw-next-selected-route-head">
          <div>
            <span>{t('rtw.discovery.selectedRoute')}</span>
            <h4><strong>{activeOrigin}</strong><span>→</span><strong>{destination.iata}</strong></h4>
            {city && <p>{city}</p>}
          </div>
          <button type="button" className="rtw-next-change-destination" onClick={() => chooseDestination(null)}>
            {t('rtw.discovery.chooseOtherDestination')}
          </button>
        </header>

        <div className="rtw-next-flight-step">
          <div className="rtw-next-step-label"><b>1</b><span>{t('rtw.discovery.chooseFlightNumber')}</span></div>
          <div className="rtw-next-flight-numbers">
            {destination.options.flatMap((option) => {
              const numbers = option.flightNumbers.flatMap((designator) => {
                const suffix = flightNumberSuffix(option.carrier, designator);
                return suffix ? [{ designator, suffix }] : [];
              });
              if (numbers.length === 0) {
                if (option.identityStatus === 'provider-listed') {
                  return [(
                    <button
                      key={`${option.carrier}-live-candidate`}
                      type="button"
                      className="rtw-next-flight-unknown"
                      data-verify-live-carrier={`${option.carrier}:${activeOrigin}-${destination.iata}`}
                      onClick={() => {
                        setFlightDraft(null);
                        setFlightTarget({ from: activeOrigin, to: destination.iata, carrier: option.carrier });
                      }}
                    >
                      <strong>{option.carrier}</strong>
                      <span>{carrierName(option.carrier)}</span>
                      <small>{liveCarrierNote}</small>
                      <em>{locale === 'zh-TW' ? '查日期與實際航班' : 'Check dates & actual flights'}</em>
                    </button>
                  )];
                }
                return [(
                  <button
                    key={`${option.carrier}-unknown`}
                    type="button"
                    className={`rtw-next-flight-unknown${activeDraft?.carrier === option.carrier && !activeDraft.flightNumber ? ' selected' : ''}`}
                    data-select-flight-later={`${option.carrier}:${activeOrigin}-${destination.iata}`}
                    aria-pressed={activeDraft?.carrier === option.carrier && !activeDraft.flightNumber}
                    onClick={() => {
                      setFlightDraft({ origin: activeOrigin, to: destination.iata, carrier: option.carrier });
                      setFlightTarget(null);
                    }}
                  >
                    <strong>{option.carrier}</strong>
                    <span>{carrierName(option.carrier)}</span>
                    <small>{t('rtw.discovery.flightNumberUnknown')}</small>
                    <em>{t('rtw.discovery.useAirlineNumberLater')}</em>
                  </button>
                )];
              }
              return [
                ...numbers.map(({ designator, suffix }) => {
                const selected = activeDraft?.carrier === option.carrier && activeDraft.flightNumber === suffix;
                return (
                  <button
                    key={`${option.carrier}-${suffix}`}
                    type="button"
                    className={`rtw-next-flight-number${selected ? ' selected' : ''}`}
                    data-select-flight-number={`${designator}:${activeOrigin}-${destination.iata}`}
                    aria-pressed={selected}
                    onClick={() => {
                      setFlightDraft({ origin: activeOrigin, to: destination.iata, carrier: option.carrier, flightNumber: suffix });
                      setFlightTarget(null);
                    }}
                  >
                    <strong>{designator}</strong>
                    <span>{carrierName(option.carrier)}</span>
                    <small className={option.scheduleStatus === 'covered' ? '' : 'needs-check'}>
                      {t(`rtw.discovery.status.${option.scheduleStatus}`)}
                    </small>
                  </button>
                );
                }),
                <button
                  key={`${option.carrier}-later`}
                  type="button"
                  className={`rtw-next-flight-unknown${activeDraft?.carrier === option.carrier && !activeDraft.flightNumber ? ' selected' : ''}`}
                  data-select-flight-later={`${option.carrier}:${activeOrigin}-${destination.iata}`}
                  aria-pressed={activeDraft?.carrier === option.carrier && !activeDraft.flightNumber}
                  onClick={() => {
                    setFlightDraft({ origin: activeOrigin, to: destination.iata, carrier: option.carrier });
                    setFlightTarget(null);
                  }}
                >
                  <strong>{option.carrier}</strong>
                  <span>{carrierName(option.carrier)}</span>
                  <small>{t('rtw.discovery.flightNumberLater')}</small>
                  <em>{t('rtw.discovery.useAirlineNumberLater')}</em>
                </button>,
              ];
            })}
          </div>
        </div>

        {activeDraft && (
          <div className="rtw-next-draft-controls">
            <label className="rtw-next-draft-timing">
              <span><b>2</b>{t('rtw.discovery.arrivalTiming')}</span>
              <select
                value={activeDraft.stopover === undefined ? '' : activeDraft.stopover ? 'stopover' : 'transfer'}
                data-next-leg-timing={`${activeOrigin}-${destination.iata}`}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === '') {
                    const rest: FlightDraft = { ...activeDraft };
                    delete (rest as { stopover?: boolean }).stopover;
                    setFlightDraft(rest);
                  } else {
                    setFlightDraft({ ...activeDraft, stopover: value === 'stopover' });
                  }
                }}
              >
                <option value="">{t('rtw.timing.unknown')}</option>
                <option value="transfer">{t('rtw.timing.transferLong')}</option>
                <option value="stopover">{t('rtw.timing.stopoverLong')}</option>
              </select>
              <small>{t('rtw.discovery.arrivalTimingNote')}</small>
            </label>
            <label className="rtw-next-draft-cabin">
              <span><b>3</b>{t('rtw.discovery.chooseCabin')}</span>
              <select
                value={activeDraft.cabin ?? ''}
                data-next-leg-cabin={`${activeOrigin}-${destination.iata}`}
                onChange={(event) => {
                  const value = event.target.value as CabinId | '';
                  if (value) setFlightDraft({ ...activeDraft, cabin: value });
                  else {
                    const rest: FlightDraft = { ...activeDraft };
                    delete (rest as { cabin?: CabinId }).cabin;
                    setFlightDraft(rest);
                  }
                }}
              >
                <option value="">{t('rtw.legChip.cabinUnset')}</option>
                <option value="economy">{t('cabin.economy')}</option>
                <option value="premium-economy">{t('cabin.premiumEconomy')}</option>
                <option value="business">{t('cabin.business')}</option>
                <option value="first">{t('cabin.first')}</option>
              </select>
              <small>{t('rtw.discovery.cabinEvidenceNote')}</small>
            </label>
            <div className="rtw-next-draft-time">
              <span><b>4</b>{t('rtw.discovery.chooseDateTime')}</span>
              <div className="rtw-next-draft-actions">
                <button
                  type="button"
                  className="flight-dates-open"
                  data-open-flight-dates={`${activeOrigin}-${destination.iata}`}
                  onClick={() => setFlightTarget({
                    from: activeOrigin,
                    to: destination.iata,
                    carrier: activeDraft.carrier,
                    ...(activeDraft.flightNumber ? { flightNumber: activeDraft.flightNumber } : {}),
                  })}
                >
                  {activeDraft.flightNumber
                    ? t('rtw.discovery.checkSelectedFlightTime', { flight: `${activeDraft.carrier}${activeDraft.flightNumber}` })
                    : t('rtw.discovery.findFlightNumber')}
                </button>
                <button
                  type="button"
                  className="rtw-next-add-later"
                  data-add-draft={`${activeDraft.carrier}:${activeOrigin}-${destination.iata}`}
                  {...(activeDraft.flightNumber
                    ? { 'data-add-selected-flight': `${activeDraft.carrier}${activeDraft.flightNumber}:${activeOrigin}-${destination.iata}` }
                    : {})}
                  onClick={() => {
                    onAddPair(activeOrigin, destination.iata, activeDraft.carrier, {
                      ...(activeDraft.flightNumber ? { flightNumber: activeDraft.flightNumber } : {}),
                      ...(activeDraft.cabin ? { cabin: activeDraft.cabin } : {}),
                      ...(activeDraft.stopover !== undefined ? { stopover: activeDraft.stopover } : {}),
                    });
                    chooseDestination(null);
                    setQueryState({ origin: activeOrigin, value: '' });
                  }}
                >{activeDraft.flightNumber ? t('rtw.discovery.addFlightDateLater') : t('rtw.discovery.addWithoutFlightNumber')}</button>
              </div>
            </div>
          </div>
        )}

        <details className="rtw-next-selected-evidence">
          <summary>{t('rtw.discovery.evidenceAndSchedule')}</summary>
          {destination.options.map(renderEvidence)}
        </details>
      </section>
    );
  }

  return (
    <section className="rtw-explorer" aria-label={t('rtw.explorer.title')}>
      <div className="rtw-explorer-head">
        <div>
          <h3>{t('rtw.explorer.title')}</h3>
          <p>{t('rtw.discovery.stepHint')}</p>
        </div>
      </div>
      {activeOrigin === '' ? (
        <div className="rtw-explorer-empty rtw-next-start-prompt">{t('rtw.discovery.startPrompt')}</div>
      ) : activeSurfaceDraft ? (
        renderSurfaceDraft(activeSurfaceDraft)
      ) : selectedRoute ? (
        <>
          {renderSelectedRoute(selectedRoute)}
          {network === null && <p className="rtw-discovery-load-note" role="status">{t('rtw.discovery.networkUnavailable')}</p>}
        </>
      ) : (
        <>
          <div className="rtw-next-origin" data-origin={activeOrigin}>
            <span>{t('rtw.discovery.from', { origin: activeOrigin })}</span>
            <strong>{activeOrigin}</strong><span aria-hidden="true">→</span><strong>?</strong>
          </div>
          {sameCityAirports.length > 0 && (
            <section className="rtw-next-same-city" aria-label={t('rtw.discovery.sameCityAirports')}>
              <div className="rtw-next-same-city-head">
                <strong>{t('rtw.discovery.sameCityAirports')}</strong>
                <span>{t('rtw.discovery.sameCityHint')}</span>
              </div>
              <div className="rtw-next-same-city-options">
                {sameCityAirports.map((airport) => (
                  <button
                    key={airport.iata}
                    type="button"
                    data-select-surface={`${activeOrigin}-${airport.iata}`}
                    onClick={() => chooseSurfaceDestination(airport.iata)}
                  >
                    <strong>{activeOrigin} ⇢ {airport.iata}</strong>
                    <span>{airport.name}</span>
                    <small>{t('rtw.discovery.surfaceTransport')}</small>
                  </button>
                ))}
              </div>
            </section>
          )}
          <p className="rtw-next-example">{t('rtw.discovery.segmentExample')}</p>
          <p className="rtw-next-map-hint">{t('rtw.discovery.mapHint')}</p>
          <label className="rtw-explorer-search rtw-next-search">
            <span>{t('rtw.discovery.search')}</span>
            <input type="search" value={query} onChange={(event) => setQueryState({ origin: activeOrigin, value: event.target.value })} placeholder={t('rtw.discovery.searchPlaceholder')} />
          </label>
          <details className="rtw-next-advanced">
            <summary>{t('rtw.discovery.advanced')}</summary>
            <label className="rtw-explorer-date">
              <span>{t('rtw.integrity.coverageDate')}</span>
              <input type="date" value={referenceDate} onChange={(event) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setReferenceDate(event.target.value);
              }} />
            </label>
            <p className="rtw-scope-note">{t('rtw.integrity.coverage')}</p>
          </details>
          {network === null && <p className="rtw-discovery-load-note" role="status">{t('rtw.discovery.networkUnavailable')}</p>}
          <p className="rtw-next-count">{t('rtw.discovery.count', { destinations: destinations.length, options: optionCount })}</p>
          {destinations.length === 0 ? (
            <div className="rtw-explorer-empty">
              <p>{originDestinations.length === 0
                ? t('rtw.discovery.noOrigin', { origin: activeOrigin })
                : t('rtw.discovery.noMatch', { origin: activeOrigin })}</p>
              {query !== '' && <button type="button" onClick={() => setQueryState({ origin: activeOrigin, value: '' })}>{t('rtw.discovery.clearFilters')}</button>}
            </div>
          ) : <div className="rtw-next-list">{destinations.map(renderDestination)}</div>}
          {renderManualPlanner()}
        </>
      )}
      {flightTarget?.from === activeOrigin && attachable && <FlightDatesPanel key={`${flightTarget.from}:${flightTarget.to}:${flightTarget.carrier}:${flightTarget.flightNumber ?? ''}`}
        from={flightTarget.from} to={flightTarget.to} initialDate={referenceDate}
        carriers={new Set([flightTarget.carrier])} schedules={schedules}
        officialSchedules={officialSchedules}
        {...(liveBase ? { apiBase: liveBase } : {})}
        flightNumber={flightTarget.flightNumber}
        onClose={() => setFlightTarget(null)} onChoose={(flight) => {
          onAddPair(flight.from, flight.to, flight.carrier, {
            departsOn: selectedDepartureDate(flight),
            flightNumber: flight.flightNumber,
            ...(activeDraft?.cabin ? { cabin: activeDraft.cabin } : {}),
            ...(activeDraft?.stopover !== undefined ? { stopover: activeDraft.stopover } : {}),
          });
          setFlightTarget(null); chooseDestination(null); setQueryState({ origin: activeOrigin, value: '' });
        }} />}
    </section>
  );
}
