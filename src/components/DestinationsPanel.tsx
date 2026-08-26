import { useMemo, useState } from 'react';
import type { ScheduleEntry } from '../lib/schemas/flight-schedules.ts';
import type { Airport } from '../lib/types.ts';
import {
  destinationsForCarrier,
  groupDestinationsByGeo,
  type ContinentDestinationGroup,
} from '../lib/rtw/route-discovery.ts';
import { useLocale } from '../i18n/use-locale.ts';

/**
 * Route discovery over the flight-schedule catalog (convergence contract §4,
 * network explorer B): pick an alliance carrier, see its KNOWN nonstop
 * destinations, click one to extend the active route chain.
 *
 * Honesty rules:
 *   - Coverage mirrors the schedule catalog exactly. A carrier without rows
 *     renders the explicit empty note — never a fake "no destinations".
 *   - A destination chip is clickable only where it can legally attach:
 *     start a fresh chain, match the buffered pending airport, or continue
 *     from the current chain end. Everything else stays disabled with a
 *     hint naming the required origin.
 *
 * When geo maps are supplied the destination list tiers into
 * continent → subregion → country → airport chips (subregion optional per
 * country); without them it degrades to the original flat chip row.
 */

export interface ExplorerCarrier {
  readonly code: string;
  readonly name: string;
}

interface DestinationsPanelProps {
  readonly schedules: ReadonlyArray<ScheduleEntry>;
  readonly carriers: ReadonlyArray<ExplorerCarrier>;
  readonly defaultCarrier?: string | undefined;
  /** Last airport of the active chain; undefined when it has no legs. */
  readonly chainEnd?: string | undefined;
  /** Buffered first airport while the group waits for its second one. */
  readonly pendingIata?: string | undefined;
  readonly lookupAirport: (iata: string) => Airport | undefined;
  /** Country→continent map (geo catalog); enables the tiered tree. */
  readonly countryContinents?: ReadonlyMap<string, string> | undefined;
  /** Country→subregion second tier; optional rows hang under continents. */
  readonly countrySubregions?: ReadonlyMap<string, string> | undefined;
  readonly onAddPair: (from: string, to: string) => void;
}

export function DestinationsPanel({
  schedules,
  carriers,
  defaultCarrier,
  chainEnd,
  pendingIata,
  lookupAirport,
  countryContinents,
  countrySubregions,
  onAddPair,
}: DestinationsPanelProps): React.ReactElement {
  const { t } = useLocale();
  const initialCarrier =
    defaultCarrier !== undefined && carriers.some((c) => c.code === defaultCarrier)
      ? defaultCarrier
      : (carriers[0]?.code ?? '');
  const [carrierCode, setCarrierCode] = useState(initialCarrier);
  const [originOverride, setOriginOverride] = useState<string | undefined>(undefined);

  const destinations = useMemo(
    () => destinationsForCarrier(schedules, carrierCode),
    [schedules, carrierCode],
  );
  const origins = useMemo(() => [...destinations.keys()], [destinations]);

  const autoOrigin =
    chainEnd !== undefined && destinations.has(chainEnd)
      ? chainEnd
      : pendingIata !== undefined && destinations.has(pendingIata)
        ? pendingIata
        : origins[0];
  // '' only occurs with zero origins, where the empty note renders and no
  // chip logic runs.
  const activeOrigin = originOverride ?? autoOrigin ?? '';

  function chipEnabled(origin: string): boolean {
    if (chainEnd !== undefined) return origin === chainEnd;
    return pendingIata === undefined || pendingIata === origin;
  }

  function chipHint(origin: string, to: string): string {
    if (!chipEnabled(origin)) {
      return t('rtw.explorer.mismatchHint', { end: chainEnd ?? pendingIata ?? '' });
    }
    if (chainEnd === undefined) {
      return t('rtw.explorer.startHint', { origin, to });
    }
    return t('rtw.explorer.addHint', { origin, to });
  }

  function renderChip(destination: { iata: string; confidence: 'chart-verified' | 'community-corrected' }) {
    const airport = lookupAirport(destination.iata);
    const city = airport?.city ?? '';
    return (
      <button
        key={destination.iata}
        type="button"
        className="rtw-dest-chip"
        aria-label={`${activeOrigin}→${destination.iata}${city !== '' ? ` · ${city}` : ''}`}
        disabled={!chipEnabled(activeOrigin)}
        title={`${chipHint(activeOrigin, destination.iata)} · ${
          destination.confidence === 'community-corrected' ? '≈' : '✓'
        }`}
        onClick={() => onAddPair(activeOrigin, destination.iata)}
      >
        <strong>{destination.iata}</strong>
        {city !== '' && <span>{city}</span>}
        {destination.confidence === 'community-corrected' && <em aria-hidden="true">≈</em>}
      </button>
    );
  }

  const geoTiered =
    countryContinents !== undefined &&
    countrySubregions !== undefined &&
    countryContinents.size > 0;

  const grouped: ReadonlyArray<ContinentDestinationGroup> | null = useMemo(() => {
    if (!geoTiered || activeOrigin === '') return null;
    const list = destinations.get(activeOrigin);
    if (list === undefined) return null;
    return groupDestinationsByGeo(
      list,
      (iata) => lookupAirport(iata)?.country,
      (country) => countryContinents?.get(country),
      (country) => countrySubregions?.get(country),
    );
  }, [geoTiered, activeOrigin, destinations, lookupAirport, countryContinents, countrySubregions]);

  function countryLabel(country: string): string {
    const key = t(`rtw.country.${country}`);
    return key.startsWith('rtw.country.') ? country : key;
  }

  function renderCountryGroups(countries: ReadonlyArray<{ country: string; destinations: ReadonlyArray<{ iata: string; confidence: 'chart-verified' | 'community-corrected' }> }>) {
    return countries.map((group) => (
      <details
        key={group.country}
        className="rtw-dest-country"
        open={group.country === 'TW'}
      >
        <summary>
          {countryLabel(group.country)}
          <span className="rtw-dest-country-count">{group.destinations.length}</span>
        </summary>
        <div className="rtw-dest-chips">{group.destinations.map(renderChip)}</div>
      </details>
    ));
  }

  const selectedName = carriers.find((c) => c.code === carrierCode)?.name ?? carrierCode;
  const communityCount = activeOrigin
    ? (destinations.get(activeOrigin) ?? []).filter((d) => d.confidence === 'community-corrected').length
    : 0;

  return (
    <section className="rtw-explorer" aria-label={t('rtw.explorer.title')}>
      <div className="rtw-explorer-head">
        <h3>{t('rtw.explorer.title')}</h3>
        <label className="rtw-explorer-carrier">
          <span>{t('rtw.explorer.carrier')}</span>
          <select
            value={carrierCode}
            onChange={(event) => {
              // Switching airline resets the manual origin choice — origins
              // belong to the selected carrier's network.
              setCarrierCode(event.target.value);
              setOriginOverride(undefined);
            }}
          >
            {(carriers.length === 0 || !carriers.some((c) => c.code === carrierCode)) && (
              <option value={carrierCode}>{carrierCode}</option>
            )}
            {carriers.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {origins.length === 0 ? (
        <p className="rtw-explorer-empty">{t('rtw.explorer.empty', { carrier: selectedName })}</p>
      ) : (
        <>
          <div className="rtw-explorer-origins" role="group" aria-label={t('rtw.explorer.origin')}>
            {origins.map((origin) => (
              <button
                key={origin}
                type="button"
                className={`rtw-origin-chip${origin === activeOrigin ? ' active' : ''}`}
                onClick={() => setOriginOverride(origin)}
              >
                {origin}
              </button>
            ))}
          </div>

          {grouped !== null ? (
            <div className="rtw-dest-tree">
              {grouped.map((continentGroup) => (
                <div key={continentGroup.continent} className="rtw-dest-continent">
                  <h4>
                    {continentGroup.continent === 'unmapped'
                      ? t('rtw.explorer.otherRegions')
                      : t(`rtw.continent.${continentGroup.continent}`)}
                  </h4>
                  {continentGroup.subregions.map((sub) =>
                    sub.subregion === null ? (
                      <div key="direct" className="rtw-dest-countries">
                        {renderCountryGroups(sub.countries)}
                      </div>
                    ) : (
                      <details key={sub.subregion} open className="rtw-dest-subregion">
                        <summary>{t(`rtw.subregion.${sub.subregion}`)}</summary>
                        <div className="rtw-dest-countries">
                          {renderCountryGroups(sub.countries)}
                        </div>
                      </details>
                    ),
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rtw-dest-chips">
              {(destinations.get(activeOrigin) ?? []).map(renderChip)}
            </div>
          )}

          {communityCount > 0 && (
            <p className="rtw-explorer-legend">≈ {t('rtw.explorer.community')}</p>
          )}
        </>
      )}
    </section>
  );
}
