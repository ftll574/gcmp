import { useMemo, useState, type ReactNode } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import type { ScheduleEntry } from '../lib/schemas/flight-schedules.ts';
import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { Airport } from '../lib/types.ts';
import {
  buildRouteCatalogPairs,
  groupRouteCatalog,
  type RouteBrowserOfficialCatalog,
  type RouteCatalogCarrierView,
  type RouteCatalogContinent,
  type RouteCatalogEvidenceView,
  type RouteCatalogGroupMode,
} from '../lib/rtw/route-catalog-browser.ts';
import './RouteCatalogBrowser.css';

export interface RouteCatalogBrowserProps {
  readonly routeNetwork?: RouteNetworkCatalog | null | undefined;
  readonly schedules?: ReadonlyArray<ScheduleEntry> | null | undefined;
  readonly officialSchedules?: RouteBrowserOfficialCatalog | null | undefined;
  readonly memberCodes: ReadonlySet<string>;
  readonly airports?: ReadonlyMap<string, Airport> | null | undefined;
  readonly countryContinents?: ReadonlyMap<string, ContinentId> | null | undefined;
  readonly airportContinentOverrides?: ReadonlyMap<string, ContinentId> | null | undefined;
}

interface LazyDisclosureProps {
  readonly className: string;
  readonly summary: ReactNode;
  readonly renderChildren: () => ReactNode;
  readonly data?: Record<string, string> | undefined;
}

function LazyDisclosure({ className, summary, renderChildren, data }: LazyDisclosureProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <details
      className={className}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      {...Object.fromEntries(Object.entries(data ?? {}).map(([key, value]) => [`data-${key}`, value]))}
    >
      <summary>{summary}</summary>
      {open ? renderChildren() : null}
    </details>
  );
}

const COPY = {
  'zh-TW': {
    intro: '先選分群方式，再逐層展開洲別、國家／地區、機場與航線；班號與來源只在最深層顯示。',
    byFrom: '依出發地',
    byTo: '依抵達地',
    airport: '機場',
    airports: '機場',
    countries: '國家／地區',
    routes: '航線',
    carriers: '航司',
    flights: '班號',
    knownFlights: '已知班號',
    candidateFlights: '候選班號',
    candidateNote: '候選班號來自近期觀測、standing 或 marketing 參考；請再確認日期與實際營運者。',
    noFlights: '目前資料只有航線證據，尚沒有可列出的確切班號。',
    evidence: '班表與資料來源',
    routeEvidence: '航線來源',
    weeklySchedule: '週班表',
    officialService: '官方班次',
    flightReference: '班號參考',
    flightCandidate: '候選班號參考',
    operating: '已確認營運者',
    providerListed: '供應商列示，實際營運者需再驗證',
    activeDays: '營運日',
    exactDates: '指定日期',
    validity: '有效期間',
    time: '時間',
    source: '來源',
    unmapped: '未分類',
    empty: '這個聯盟目前沒有可瀏覽的航線資料。',
  },
  en: {
    intro: 'Choose a grouping, then expand continent, country/region, airport and route levels. Flight numbers and evidence stay hidden until the deepest level.',
    byFrom: 'Group by origin',
    byTo: 'Group by destination',
    airport: 'airport',
    airports: 'airports',
    countries: 'countries/regions',
    routes: 'routes',
    carriers: 'carriers',
    flights: 'flight numbers',
    knownFlights: 'Known flight numbers',
    candidateFlights: 'Candidate flight numbers',
    candidateNote: 'Candidate numbers come from recent observations, standing data, or marketing references; recheck date and actual operator.',
    noFlights: 'Only route evidence is available here; no exact flight number is currently cataloged.',
    evidence: 'Schedule & sources',
    routeEvidence: 'Route evidence',
    weeklySchedule: 'Weekly schedule',
    officialService: 'Published service',
    flightReference: 'Flight-number reference',
    flightCandidate: 'Candidate flight-number reference',
    operating: 'Operating carrier confirmed',
    providerListed: 'Provider-listed; operating identity requires verification',
    activeDays: 'Operating days',
    exactDates: 'Exact dates',
    validity: 'Validity',
    time: 'Time',
    source: 'Source',
    unmapped: 'Unmapped',
    empty: 'No browsable route data is available for this alliance.',
  },
} as const;

const WEEKDAYS = {
  'zh-TW': ['週一', '週二', '週三', '週四', '週五', '週六', '週日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
} as const;

function evidenceKindLabel(
  kind: RouteCatalogEvidenceView['kind'],
  copy: Pick<(typeof COPY)[keyof typeof COPY], 'routeEvidence' | 'weeklySchedule' | 'officialService' | 'flightReference' | 'flightCandidate'>,
): string {
  if (kind === 'route') return copy.routeEvidence;
  if (kind === 'weekly-schedule') return copy.weeklySchedule;
  if (kind === 'official-service') return copy.officialService;
  if (kind === 'flight-number-candidate') return copy.flightCandidate;
  return copy.flightReference;
}

function EvidenceRow({ evidence, locale }: { evidence: RouteCatalogEvidenceView; locale: 'en' | 'zh-TW' }): React.ReactElement {
  const copy = COPY[locale];
  const weekdays = evidence.daysOfWeek.map((day) => WEEKDAYS[locale][day - 1]).filter(Boolean).join(' · ');
  const time = evidence.departureTime
    ? `${evidence.departureTime}${evidence.arrivalTime ? ` → ${evidence.arrivalTime}${evidence.arrivalDayOffset ? ` +${evidence.arrivalDayOffset}` : ''}` : ''}`
    : null;
  const validity = evidence.effectiveFrom || evidence.effectiveUntil
    ? `${evidence.effectiveFrom ?? '…'} → ${evidence.effectiveUntil ?? '…'}`
    : null;
  return (
    <div className="route-browser-evidence-row">
      <div className="route-browser-evidence-head">
        <strong>{evidenceKindLabel(evidence.kind, copy)}</strong>
        {evidence.flightNumbers.length > 0 && <span>{evidence.flightNumbers.join(' · ')}</span>}
        {evidence.candidateFlightNumbers.length > 0 && <span>{evidence.candidateFlightNumbers.join(' · ')}</span>}
      </div>
      <dl>
        {weekdays && <><dt>{copy.activeDays}</dt><dd>{weekdays}</dd></>}
        {evidence.addedDates.length > 0 && <><dt>{copy.exactDates}</dt><dd>{evidence.addedDates.join(' · ')}</dd></>}
        {validity && <><dt>{copy.validity}</dt><dd>{validity}</dd></>}
        {time && <><dt>{copy.time}</dt><dd>{time}</dd></>}
        {evidence.source && (
          <>
            <dt>{copy.source}</dt>
            <dd>
              <a href={evidence.source.url} target="_blank" rel="noreferrer">{evidence.source.label}</a>
              {evidence.source.checkedOn ? <small> · {evidence.source.checkedOn}</small> : null}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function CarrierDetails({ carrier, locale }: { carrier: RouteCatalogCarrierView; locale: 'en' | 'zh-TW' }): React.ReactElement {
  const copy = COPY[locale];
  return (
    <div className="route-browser-carrier-body">
      <div className="route-browser-flight-block">
        <span className="route-browser-kicker">{copy.knownFlights}</span>
        {carrier.flightNumbers.length > 0 ? (
          <div className="route-browser-flight-chips">
            {carrier.flightNumbers.map((flight) => <code key={flight}>{flight}</code>)}
          </div>
        ) : carrier.candidateFlightNumbers.length === 0 ? <p>{copy.noFlights}</p> : null}
        {carrier.candidateFlightNumbers.length > 0 && (
          <div className="route-browser-candidate-block">
            <span className="route-browser-kicker">{copy.candidateFlights}</span>
            <div className="route-browser-flight-chips candidate">
              {carrier.candidateFlightNumbers.map((flight) => <code key={flight}>{flight}</code>)}
            </div>
            <small>{copy.candidateNote}</small>
          </div>
        )}
      </div>
      <LazyDisclosure
        className="route-browser-evidence"
        summary={<><span>{copy.evidence}</span><small>{carrier.evidence.length}</small></>}
        renderChildren={() => (
          <div className="route-browser-evidence-list">
            {carrier.evidence.map((evidence) => <EvidenceRow key={evidence.id} evidence={evidence} locale={locale} />)}
          </div>
        )}
      />
    </div>
  );
}

export function RouteCatalogBrowser({
  routeNetwork,
  schedules,
  officialSchedules,
  memberCodes,
  airports,
  countryContinents,
  airportContinentOverrides,
}: RouteCatalogBrowserProps): React.ReactElement {
  const { locale: appLocale, t } = useLocale();
  const locale: 'en' | 'zh-TW' = appLocale === 'zh-TW' ? 'zh-TW' : 'en';
  const copy = COPY[locale];
  const [mode, setMode] = useState<RouteCatalogGroupMode>('from');
  const pairs = useMemo(() => buildRouteCatalogPairs({
    routeNetwork,
    schedules,
    officialSchedules,
    memberCodes,
    airports,
  }), [routeNetwork, schedules, officialSchedules, memberCodes, airports]);
  const groups = useMemo(() => groupRouteCatalog({
    pairs,
    mode,
    countryContinents,
    airportContinentOverrides,
  }), [pairs, mode, countryContinents, airportContinentOverrides]);

  function continentLabel(continent: RouteCatalogContinent): string {
    return continent === 'unmapped' ? copy.unmapped : t(`rtw.continent.${continent}`);
  }

  const regionNames = useMemo(
    () => typeof Intl.DisplayNames === 'function'
      ? new Intl.DisplayNames([locale], { type: 'region' })
      : null,
    [locale],
  );

  function countryLabel(country: string): string {
    if (country === 'unmapped') return copy.unmapped;
    return regionNames?.of(country) ?? country;
  }

  if (pairs.length === 0) return <p className="route-browser-empty">{copy.empty}</p>;

  return (
    <section className="route-browser" aria-label={locale === 'zh-TW' ? '已收錄航線瀏覽器' : 'Cataloged route browser'}>
      <div className="route-browser-toolbar">
        <p>{copy.intro}</p>
        <div className="route-browser-mode" role="group" aria-label={locale === 'zh-TW' ? '航線分群方式' : 'Route grouping'}>
          <button type="button" aria-pressed={mode === 'from'} onClick={() => setMode('from')}>{copy.byFrom}</button>
          <button type="button" aria-pressed={mode === 'to'} onClick={() => setMode('to')}>{copy.byTo}</button>
        </div>
      </div>
      <div className="route-browser-continents">
        {groups.map((continent) => (
          <LazyDisclosure
            key={continent.continent}
            className="route-browser-continent"
            data={{ continent: continent.continent }}
            summary={(
              <>
                <strong>{continentLabel(continent.continent)}</strong>
                <span>{continent.countries.length} {copy.countries} · {continent.airportCount} {copy.airports} · {continent.routeCount} {copy.routes} · {continent.flightCount} {copy.flights}</span>
              </>
            )}
            renderChildren={() => (
              <div className="route-browser-countries">
                {continent.countries.map((countryGroup) => (
                  <LazyDisclosure
                    key={countryGroup.country}
                    className="route-browser-country"
                    data={{ country: countryGroup.country }}
                    summary={(
                      <>
                        <span className="route-browser-country-name">
                          <strong>{countryLabel(countryGroup.country)}</strong>
                          {countryGroup.country !== 'unmapped' && <code>{countryGroup.country}</code>}
                        </span>
                        <span>{countryGroup.airports.length} {copy.airports} · {countryGroup.routeCount} {copy.routes} · {countryGroup.flightCount} {copy.flights}</span>
                      </>
                    )}
                    renderChildren={() => (
                      <div className="route-browser-airports">
                        {countryGroup.airports.map((airportGroup) => (
                          <LazyDisclosure
                            key={airportGroup.iata}
                            className="route-browser-airport"
                            data={{ airport: airportGroup.iata }}
                            summary={(
                              <>
                                <span className="route-browser-airport-name">
                                  <code>{airportGroup.iata}</code>
                                  <strong>{airportGroup.airport?.city ?? airportGroup.airport?.name ?? ''}</strong>
                                </span>
                                <span>{airportGroup.routeCount} {copy.routes} · {airportGroup.carrierCount} {copy.carriers} · {airportGroup.flightCount} {copy.flights}</span>
                              </>
                            )}
                            renderChildren={() => (
                              <div className="route-browser-routes">
                                {airportGroup.routes.map((route) => {
                                  const counterpart = mode === 'from' ? route.toAirport : route.fromAirport;
                                  const counterpartCode = mode === 'from' ? route.to : route.from;
                                  return (
                                    <LazyDisclosure
                                      key={`${route.from}-${route.to}`}
                                      className="route-browser-route"
                                      data={{ route: `${route.from}-${route.to}` }}
                                      summary={(
                                        <>
                                          <span className="route-browser-route-name">
                                            <code>{route.from}→{route.to}</code>
                                            <strong>{counterpart?.city ?? counterpart?.name ?? counterpartCode}</strong>
                                          </span>
                                          <span>{route.carriers.length} {copy.carriers} · {route.flightCount} {copy.flights}</span>
                                        </>
                                      )}
                                      renderChildren={() => (
                                        <div className="route-browser-carriers">
                                          {route.carriers.map((carrier) => (
                                            <LazyDisclosure
                                              key={carrier.carrier}
                                              className="route-browser-carrier"
                                              data={{ carrier: carrier.carrier }}
                                              summary={(
                                                <>
                                                  <span className="route-browser-carrier-name">
                                                    <code>{carrier.carrier}</code>
                                                    <small className={carrier.identity === 'operating' ? 'operating' : 'provider-listed'}>
                                                      {carrier.identity === 'operating' ? copy.operating : copy.providerListed}
                                                    </small>
                                                  </span>
                                                  <span>{carrier.flightNumbers.length + carrier.candidateFlightNumbers.length} {copy.flights}</span>
                                                </>
                                              )}
                                              renderChildren={() => <CarrierDetails carrier={carrier} locale={locale} />}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          />
                        ))}
                      </div>
                    )}
                  />
                ))}
              </div>
            )}
          />
        ))}
      </div>
    </section>
  );
}
