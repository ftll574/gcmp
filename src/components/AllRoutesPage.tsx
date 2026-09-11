import { lazy, Suspense, useEffect, useId, useMemo, useState } from 'react';
import { buildAirportIndex, type AirportIndex } from '../lib/airport-index.ts';
import type { RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import {
  parseHashedRuntimeRouteNetwork,
  parseHashedRuntimeRouteNetworkCarrierShard,
  parseHashedRuntimeRouteNetworkShard,
  parseRuntimeRouteNetworkCarrierManifest,
  type RuntimeRouteNetworkCarrierManifest,
} from '../lib/route-network-runtime.ts';
import type { RouteLibraryEntitySelection } from '../lib/rtw/route-library-entities.ts';
import type { Airport } from '../lib/types.ts';
import type { RouteLibraryData } from '../state/use-route-library-data.ts';
import { RouteLibraryExplorer } from './RouteLibraryExplorer.tsx';
import { SiteHeader, type SiteView } from './SiteHeader.tsx';
import { useLocale } from '../i18n/use-locale.ts';

type AllianceFilter = 'all' | 'star' | 'oneworld' | 'skyteam';

type LoadedNetwork =
  | { readonly scope: 'full'; readonly network: RouteNetworkCatalog }
  | { readonly scope: 'origin-shard'; readonly originLetter: string; readonly network: RouteNetworkCatalog }
  | { readonly scope: 'carrier-shard'; readonly carrier: string; readonly network: RouteNetworkCatalog };

const LazyRouteCatalogBrowserLoader = lazy(() =>
  import('./RouteCatalogBrowserLoader.tsx').then((module) => ({ default: module.RouteCatalogBrowserLoader })),
);

interface Props {
  readonly data: RouteLibraryData;
  readonly onNavigate: (view: SiteView) => void;
  readonly onPlanRoute: (route: { from: string; to: string; carrier: string; flightNumber?: string | undefined }) => void;
}

function RouteNetworkLoading({
  selection,
  airportIndex,
  airports,
  carrierNames,
  routeCount,
  zh,
  onSelectAirport,
}: {
  readonly selection: RouteLibraryEntitySelection | null;
  readonly airportIndex: AirportIndex;
  readonly airports: ReadonlyMap<string, Airport>;
  readonly carrierNames: ReadonlyMap<string, string>;
  readonly routeCount?: number | undefined;
  readonly zh: boolean;
  readonly onSelectAirport: (iata: string) => void;
}): React.ReactElement {
  let label = zh ? '全球航網' : 'Global network';
  let title = zh ? '正在準備航線資料' : 'Preparing route data';
  let detail = routeCount
    ? (zh ? `正在驗證 ${routeCount.toLocaleString()} 條方向航線…` : `Verifying ${routeCount.toLocaleString()} directional routes…`)
    : (zh ? '正在驗證航線資料…' : 'Verifying route data…');

  if (selection?.kind === 'airport') {
    const airport = airports.get(selection.id);
    label = zh ? '機場' : 'Airport';
    title = airport ? `${airport.iata} · ${airport.city}` : selection.id;
    detail = airport?.name ?? detail;
  } else if (selection?.kind === 'airline') {
    label = zh ? '航空公司' : 'Airline';
    const name = carrierNames.get(selection.id);
    title = `${selection.id}${name ? ` · ${name}` : ''}`;
  } else if (selection?.kind === 'route') {
    const [fromCode = '', toCode = ''] = selection.id.split('-');
    const from = airports.get(fromCode);
    const to = airports.get(toCode);
    label = zh ? '航線' : 'Route';
    title = `${fromCode} → ${toCode}`;
    if (from && to) detail = `${from.city} → ${to.city}`;
  }

  return (
    <section className="route-context-loading route-context-loading--network" role="status" aria-live="polite" aria-busy="true">
      {selection && <div className="entity-breadcrumb route-context-loading__breadcrumb"><span>{label}</span><strong>{selection.id.replace('-', ' → ')}</strong></div>}
      <div className="route-context-loading__hero">
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <EarlyAirportSearch airportIndex={airportIndex} zh={zh} onSelectAirport={onSelectAirport} />
      <div className="route-context-loading__map" aria-hidden="true"><i /><i /><i /></div>
      <p>{zh ? '正在接上互動地圖與完整航線結果…' : 'Connecting the interactive map and complete route results…'}</p>
    </section>
  );
}

function EarlyAirportSearch({
  airportIndex,
  zh,
  onSelectAirport,
}: {
  readonly airportIndex: AirportIndex;
  readonly zh: boolean;
  readonly onSelectAirport: (iata: string) => void;
}): React.ReactElement {
  const id = useId();
  const listboxId = `${id}-route-airport-results`;
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const results = useMemo(
    () => query.trim() === '' ? [] : airportIndex.search(query, { limit: 6, locale: zh ? 'zh-TW' : 'en' }),
    [airportIndex, query, zh],
  );
  const showResults = open && query.trim() !== '';

  const choose = (iata: string): void => {
    setQuery('');
    setOpen(false);
    setHighlight(0);
    onSelectAirport(iata);
  };

  return (
    <div className="route-loading-search">
      <label htmlFor={`${id}-input`}>{zh ? '先找機場' : 'Find an airport now'}</label>
      <div className="route-loading-search__input">
        <span aria-hidden="true">⌕</span>
        <input
          id={`${id}-input`}
          type="search"
          role="combobox"
          value={query}
          placeholder={zh ? '搜尋 TPE、TYO、東京、NRT…' : 'Search TPE, TYO, Narita, NRT…'}
          autoComplete="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={showResults && results.length > 0}
          aria-controls={showResults && results.length > 0 ? listboxId : undefined}
          aria-activedescendant={showResults && results[highlight] ? `${listboxId}-${highlight}` : undefined}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setHighlight((value) => Math.min(value + 1, Math.max(results.length - 1, 0)));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlight((value) => Math.max(value - 1, 0));
            } else if (event.key === 'Enter' && results.length > 0) {
              event.preventDefault();
              const result = results[highlight] ?? results[0];
              if (result) choose(result.airport.iata);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
      </div>
      {showResults && (
        <div id={listboxId} className="route-loading-search__results" role="listbox">
          {results.length > 0 ? results.map((result, index) => (
            <button
              id={`${listboxId}-${index}`}
              key={result.airport.iata}
              type="button"
              role="option"
              aria-selected={index === highlight}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => choose(result.airport.iata)}
            >
              <code>{result.airport.iata}</code>
              <span><strong>{result.airport.city}</strong><small>{result.airport.name}</small></span>
              <em>{result.airport.country}</em>
            </button>
          )) : <p>{zh ? `找不到「${query}」` : `No airport matches “${query}”`}</p>}
        </div>
      )}
      <small>{zh ? '完整航線與班號仍在背景載入。' : 'Full routes and flight numbers continue loading in the background.'}</small>
    </div>
  );
}

function selectionFromLocation(): RouteLibraryEntitySelection | null {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('entity');
  const rawId = params.get('id')?.toUpperCase() ?? '';
  if (kind === 'airport' && /^[A-Z]{3}$/.test(rawId)) return { kind, id: rawId };
  if (kind === 'airline' && /^[A-Z0-9]{2,3}$/.test(rawId)) return { kind, id: rawId };
  if (kind === 'route' && /^[A-Z]{3}-[A-Z]{3}$/.test(rawId)) return { kind, id: rawId };
  return null;
}

function allianceFromLocation(): AllianceFilter {
  const value = new URLSearchParams(window.location.search).get('alliance');
  return value === 'star' || value === 'oneworld' || value === 'skyteam' ? value : 'all';
}

function queryFromLocation(): string {
  return new URLSearchParams(window.location.search).get('q') ?? '';
}

function advancedFromLocation(): boolean {
  return new URLSearchParams(window.location.search).get('advanced') === '1';
}

export function AllRoutesPage({ data, onNavigate, onPlanRoute }: Props): React.ReactElement {
  const { locale } = useLocale();
  const zh = locale === 'zh-TW';
  const copy = locale === 'zh-TW' ? {
    eyebrow: '航線資料庫', title: '探索全球航網',
    intro: '從機場、城市、航空公司、航線或班號，直接進入目前收錄的航網資料。',
    all: '全部聯盟', loading: '正在載入航線資料…', error: '航線資料載入失敗', retry: '重新載入',
    advanced: '詳細篩選', advancedBody: '依出發地、抵達地、航空公司與區域篩選完整航線。', closeAdvanced: '收起詳細篩選',
    footer: '航線證據會隨時間變動。開票前請再次確認日期與實際營運航空公司。',
  } : {
    eyebrow: 'Route library', title: 'Explore the global route network',
    intro: 'Start from an airport, city, airline, route or flight number and move directly through the network in the current catalog.',
    all: 'All alliances', loading: 'Loading route data…', error: 'Route library failed to load', retry: 'Reload',
    advanced: 'Detailed filters', advancedBody: 'Filter the complete network by origin, destination, airline and region.', closeAdvanced: 'Close detailed filters',
    footer: 'Route evidence changes over time. Always recheck date and operating carrier before ticketing.',
  };
  const [loadedNetwork, setLoadedNetwork] = useState<LoadedNetwork | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shardFailureLetter, setShardFailureLetter] = useState<string | null>(null);
  const [carrierShardManifest, setCarrierShardManifest] = useState<RuntimeRouteNetworkCarrierManifest | null>(null);
  const [carrierManifestFailed, setCarrierManifestFailed] = useState(false);
  const [carrierShardFailureCode, setCarrierShardFailureCode] = useState<string | null>(null);
  const [fullNetworkRequested, setFullNetworkRequested] = useState(false);
  const [alliance, setAlliance] = useState<AllianceFilter>(allianceFromLocation);
  const [selection, setSelection] = useState<RouteLibraryEntitySelection | null>(selectionFromLocation);
  const [query, setQuery] = useState(queryFromLocation);
  const [advancedOpen, setAdvancedOpen] = useState(advancedFromLocation);
  const airportIndex = useMemo(() => buildAirportIndex(data.airports), [data.airports]);
  const airports = airportIndex.byIata;
  const selectionOriginLetter = selection?.kind === 'route'
    ? selection.id.slice(0, 1)
    : selection?.kind === 'airport'
      ? selection.id.slice(0, 1)
      : null;
  const selectedCarrier = selection?.kind === 'airline' ? selection.id : null;
  const originShardMeta = selectionOriginLetter ? data.routeNetworkRuntimeMeta?.originShards[selectionOriginLetter] : undefined;
  const carrierShardMeta = selectedCarrier ? carrierShardManifest?.carriers[selectedCarrier] : undefined;
  const carrierShardSupportAvailable = Boolean(
    data.routeNetworkRuntimeMeta
    && data.routeNetworkCarrierShardBaseUrl
    && data.routeNetworkCarrierShardManifestUrl,
  );
  const fullNetworkReady = loadedNetwork?.scope === 'full';
  const displayNetwork = loadedNetwork?.scope === 'full'
    ? loadedNetwork.network
    : loadedNetwork?.scope === 'origin-shard'
      && (selection?.kind === 'route' || selection?.kind === 'airport')
      && selectionOriginLetter === loadedNetwork.originLetter
      ? loadedNetwork.network
      : loadedNetwork?.scope === 'carrier-shard'
        && selection?.kind === 'airline'
        && selectedCarrier === loadedNetwork.carrier
        ? loadedNetwork.network
      : null;

  useEffect(() => {
    if (fullNetworkReady || fullNetworkRequested || selection?.kind !== 'airline') return;
    if (carrierShardManifest || carrierManifestFailed || !carrierShardSupportAvailable || !data.routeNetworkCarrierShardManifestUrl) return;
    const controller = new AbortController();
    void fetch(data.routeNetworkCarrierShardManifestUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const manifest = parseRuntimeRouteNetworkCarrierManifest(await response.json());
        if (manifest.runtimeSha256 !== data.routeNetworkRuntimeMeta?.outputSha256) {
          throw new Error('carrier shard manifest does not match the current runtime graph');
        }
        return manifest;
      })
      .then(setCarrierShardManifest)
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name === 'AbortError') return;
        setCarrierManifestFailed(true);
      });
    return () => controller.abort();
  }, [
    carrierManifestFailed,
    carrierShardManifest,
    data.routeNetworkCarrierShardManifestUrl,
    data.routeNetworkRuntimeMeta,
    carrierShardSupportAvailable,
    fullNetworkReady,
    fullNetworkRequested,
    selection?.kind,
  ]);

  useEffect(() => {
    if (fullNetworkReady || fullNetworkRequested) return;
    if ((selection?.kind !== 'route' && selection?.kind !== 'airport') || !selectionOriginLetter || !originShardMeta) return;
    if (shardFailureLetter === selectionOriginLetter) return;
    if (loadedNetwork?.scope === 'origin-shard' && loadedNetwork.originLetter === selectionOriginLetter) return;

    const controller = new AbortController();
    const shardUrl = `${data.routeNetworkOriginShardBaseUrl}/${selectionOriginLetter}.json`;
    void fetch(shardUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const knownAirports = new Set(airports.keys());
        if (globalThis.crypto?.subtle) {
          return parseHashedRuntimeRouteNetworkShard(await response.arrayBuffer(), originShardMeta, knownAirports);
        }
        const { parseRouteNetworkCatalog } = await import('../lib/schemas/route-network.ts');
        return parseRouteNetworkCatalog(await response.json(), knownAirports);
      })
      .then((network) => {
        setLoadedNetwork((current) => current?.scope === 'full'
          ? current
          : { scope: 'origin-shard', originLetter: selectionOriginLetter, network });
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name === 'AbortError') return;
        setShardFailureLetter(selectionOriginLetter);
      });
    return () => controller.abort();
  }, [
    airports,
    data.routeNetworkOriginShardBaseUrl,
    fullNetworkReady,
    fullNetworkRequested,
    loadedNetwork,
    originShardMeta,
    selectionOriginLetter,
    selection?.kind,
    shardFailureLetter,
  ]);

  useEffect(() => {
    if (fullNetworkReady || fullNetworkRequested || selection?.kind !== 'airline' || !selectedCarrier || !carrierShardMeta || !data.routeNetworkCarrierShardBaseUrl) return;
    if (carrierShardFailureCode === selectedCarrier) return;
    if (loadedNetwork?.scope === 'carrier-shard' && loadedNetwork.carrier === selectedCarrier) return;
    const controller = new AbortController();
    const shardUrl = `${data.routeNetworkCarrierShardBaseUrl}/${selectedCarrier}.json`;
    void fetch(shardUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const knownAirports = new Set(airports.keys());
        if (globalThis.crypto?.subtle) {
          return parseHashedRuntimeRouteNetworkCarrierShard(
            await response.arrayBuffer(),
            carrierShardMeta,
            selectedCarrier,
            knownAirports,
          );
        }
        const { parseRouteNetworkCatalog } = await import('../lib/schemas/route-network.ts');
        const network = parseRouteNetworkCatalog(await response.json(), knownAirports);
        if (network.routes.some((route) => route.carrier !== selectedCarrier || route.status !== 'published')) {
          throw new Error(`carrier shard ${selectedCarrier} contains routes outside its published carrier scope`);
        }
        return network;
      })
      .then((network) => {
        setLoadedNetwork((current) => current?.scope === 'full'
          ? current
          : { scope: 'carrier-shard', carrier: selectedCarrier, network });
      })
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name === 'AbortError') return;
        setCarrierShardFailureCode(selectedCarrier);
      });
    return () => controller.abort();
  }, [
    airports,
    carrierShardFailureCode,
    carrierShardMeta,
    data.routeNetworkCarrierShardBaseUrl,
    fullNetworkReady,
    fullNetworkRequested,
    loadedNetwork,
    selectedCarrier,
    selection?.kind,
  ]);

  const airlineNeedsFullNetwork = selection?.kind === 'airline' && (
    !data.routeNetworkRuntimeMeta
    || !carrierShardSupportAvailable
    || carrierManifestFailed
    || (carrierShardManifest !== null && !carrierShardMeta)
    || carrierShardFailureCode === selectedCarrier
  );
  const originSelectionNeedsFullNetwork = (selection?.kind === 'route' || selection?.kind === 'airport')
    && (!originShardMeta || shardFailureLetter === selectionOriginLetter);

  const shouldLoadFullNetwork = !fullNetworkReady && (
    fullNetworkRequested
    || selection === null
    || advancedOpen
    || airlineNeedsFullNetwork
    || originSelectionNeedsFullNetwork
  );

  useEffect(() => {
    if (!shouldLoadFullNetwork || fullNetworkReady) return;
    const controller = new AbortController();
    void fetch(data.routeNetworkRuntimeUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const knownAirports = new Set(airports.keys());
        if (data.routeNetworkRuntimeMeta && globalThis.crypto?.subtle) {
          return parseHashedRuntimeRouteNetwork(
            await response.arrayBuffer(),
            data.routeNetworkRuntimeMeta,
            knownAirports,
          );
        }
        // Web Crypto requires a secure context in browsers. Keep local/LAN
        // HTTP deployments functional by falling back to the canonical parser.
        const { parseRouteNetworkCatalog } = await import('../lib/schemas/route-network.ts');
        return parseRouteNetworkCatalog(await response.json(), knownAirports);
      })
      .then((network) => setLoadedNetwork({ scope: 'full', network }))
      .catch((reason: unknown) => {
        if ((reason as { name?: string }).name === 'AbortError') return;
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => controller.abort();
  }, [shouldLoadFullNetwork, fullNetworkReady, data.routeNetworkRuntimeUrl, data.routeNetworkRuntimeMeta, airports]);

  useEffect(() => {
    const sync = (): void => {
      setSelection(selectionFromLocation());
      setAlliance(allianceFromLocation());
      setQuery(queryFromLocation());
      setAdvancedOpen(advancedFromLocation());
    };
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);

  const replaceUiState = (next: { alliance?: AllianceFilter; query?: string; advanced?: boolean }): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'routes');
    if (next.alliance !== undefined) {
      if (next.alliance === 'all') url.searchParams.delete('alliance');
      else url.searchParams.set('alliance', next.alliance);
    }
    if (next.query !== undefined) {
      if (next.query.trim() === '') url.searchParams.delete('q');
      else url.searchParams.set('q', next.query);
    }
    if (next.advanced !== undefined) {
      if (next.advanced) url.searchParams.set('advanced', '1');
      else url.searchParams.delete('advanced');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const changeAlliance = (value: AllianceFilter): void => {
    setAlliance(value);
    replaceUiState({ alliance: value });
  };

  const changeQuery = (value: string): void => {
    setQuery(value);
    replaceUiState({ query: value });
  };

  const memberships = data.allianceCatalog.memberships.filter((membership) => membership.status === 'member');
  const memberCodes = useMemo(() => new Set(
    memberships
      .filter((membership) => alliance === 'all' || membership.alliance === alliance)
      .map((membership) => membership.airline),
  ), [memberships, alliance]);
  const carrierNames = useMemo(() => new Map(memberships.map((membership) => [membership.airline, membership.airlineName] as const)), [memberships]);
  const selectEntity = (next: RouteLibraryEntitySelection | null): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'routes');
    if (next) {
      url.searchParams.set('entity', next.kind);
      url.searchParams.set('id', next.id);
    } else {
      url.searchParams.delete('entity');
      url.searchParams.delete('id');
    }
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setSelection(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="site-page routes-page">
      <SiteHeader active="routes" onNavigate={onNavigate} />
      <main id="main-content" className="routes-page-main">
        <section className="routes-page-intro">
          <span className="routes-page-kicker">{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </section>

        {!displayNetwork && !error && <RouteNetworkLoading
          selection={selection}
          airportIndex={airportIndex}
          airports={airports}
          carrierNames={carrierNames}
          routeCount={data.routeNetworkRuntimeMeta?.routes}
          zh={zh}
          onSelectAirport={(iata) => selectEntity({ kind: 'airport', id: iata })}
        />}
        {error && <div className="routes-error" role="alert"><strong>{copy.error}</strong><span>{error}</span><button type="button" onClick={() => window.location.reload()}>{copy.retry}</button></div>}
        {displayNetwork && (
          <>
            <RouteLibraryExplorer
              network={displayNetwork}
              airports={airports}
              carrierNames={carrierNames}
              memberCodes={memberCodes}
              alliance={alliance}
              onAllianceChange={changeAlliance}
              query={query}
              onQueryChange={changeQuery}
              countryContinents={data.countryContinents}
              airportContinentOverrides={data.airportContinentOverrides}
              selection={selection}
              onSelect={selectEntity}
              onPlanRoute={onPlanRoute}
              networkComplete={fullNetworkReady}
              onRequestFullNetwork={() => setFullNetworkRequested(true)}
            />

            <section className="routes-advanced-shell">
              <button type="button" className="routes-advanced-toggle" aria-expanded={advancedOpen} onClick={() => {
                const next = !advancedOpen;
                setAdvancedOpen(next);
                replaceUiState({ advanced: next });
              }}>
                <span>{advancedOpen ? copy.closeAdvanced : copy.advanced}</span><small>{copy.advancedBody}</small>
              </button>
              {advancedOpen && <section className="routes-browser-shell">
                <Suspense fallback={<div className="routes-loading" role="status">{copy.loading}</div>}>
                  {fullNetworkReady ? <LazyRouteCatalogBrowserLoader
                    routeNetwork={displayNetwork}
                    memberCodes={memberCodes}
                    airports={airports}
                    countryContinents={data.countryContinents}
                    countrySubregions={data.countrySubregions}
                    airportContinentOverrides={data.airportContinentOverrides}
                    carrierNames={carrierNames}
                  /> : <div className="routes-loading" role="status">{copy.loading}</div>}
                </Suspense>
              </section>}
            </section>
          </>
        )}
      </main>
      <footer className="site-footer"><strong>gcmp</strong><span>{copy.footer}</span></footer>
    </div>
  );
}
