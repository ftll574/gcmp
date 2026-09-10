import type { ContinentId } from '../lib/schemas/country-continent.ts';
import type { RouteNetworkCatalog } from '../lib/schemas/route-network.ts';
import type { Airport } from '../lib/types.ts';
import { useLocaleState } from '../i18n/use-locale-state.ts';
import { useRouteLibraryAdvancedData } from '../state/use-route-library-advanced-data.ts';
import { RouteCatalogBrowserWithOfficialSchedules } from './RouteCatalogBrowserWithOfficialSchedules.tsx';

interface Props {
  readonly routeNetwork: RouteNetworkCatalog;
  readonly memberCodes: ReadonlySet<string>;
  readonly airports: ReadonlyMap<string, Airport>;
  readonly countryContinents: ReadonlyMap<string, ContinentId> | null;
  readonly countrySubregions: ReadonlyMap<string, string> | null;
  readonly airportContinentOverrides: ReadonlyMap<string, ContinentId> | null;
  readonly carrierNames: ReadonlyMap<string, string>;
}

export function RouteCatalogBrowserLoader({
  routeNetwork,
  memberCodes,
  airports,
  countryContinents,
  countrySubregions,
  airportContinentOverrides,
  carrierNames,
}: Props): React.ReactElement {
  const { locale } = useLocaleState();
  const { state, retry } = useRouteLibraryAdvancedData();
  const copy = locale === 'zh-TW'
    ? { loading: '正在載入詳細航線資料…', error: '詳細航線資料載入失敗', retry: '重新載入' }
    : { loading: 'Loading detailed route data…', error: 'Detailed route data failed to load', retry: 'Retry' };

  if (state.status === 'loading') {
    return <div className="routes-loading" role="status">{copy.loading}</div>;
  }
  if (state.status === 'error') {
    return <div className="routes-error" role="alert"><strong>{copy.error}</strong><span>{state.error}</span><button type="button" onClick={retry}>{copy.retry}</button></div>;
  }

  return (
    <RouteCatalogBrowserWithOfficialSchedules
      routeNetwork={routeNetwork}
      schedules={state.data.schedules}
      officialSchedules={state.data.officialSchedules}
      memberCodes={memberCodes}
      airports={airports}
      countryContinents={countryContinents}
      countrySubregions={countrySubregions}
      airportBrowseRegions={state.data.airportBrowseRegions}
      airportContinentOverrides={airportContinentOverrides}
      carrierNames={carrierNames}
    />
  );
}
