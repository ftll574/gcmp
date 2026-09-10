import { AllRoutesPage } from './components/AllRoutesPage.tsx';
import { SiteHeader, type SiteView } from './components/SiteHeader.tsx';
import { useLocaleState } from './i18n/use-locale-state.ts';
import type { FlightLeg, RoutingRequest } from './lib/types.ts';
import { useRouteLibraryData } from './state/use-route-library-data.ts';

interface Props {
  readonly onNavigateSite: (view: SiteView) => void;
}

const DEFAULT_ROUTING: RoutingRequest = {
  groups: [{ legs: [] }],
  cabin: 'economy',
  programs: ['aa-aadvantage', 'as-mileage-plan'],
};

async function routeToPlanner(leg: FlightLeg, onNavigateSite: (view: SiteView) => void): Promise<void> {
  const { encodeShareUrl, parseShareUrl } = await import('./lib/url-schema.ts');
  const parsed = window.location.hash.startsWith('#/r/')
    ? parseShareUrl(window.location.hash.slice(1))
    : null;
  const current = parsed?.ok ? parsed.request : DEFAULT_ROUTING;
  const next: RoutingRequest = { ...current, groups: [{ legs: [leg] }] };
  window.location.hash = encodeShareUrl(next);
  onNavigateSite('planner');
}

export function RoutesApp({ onNavigateSite }: Props): React.ReactElement {
  const { locale } = useLocaleState();
  const load = useRouteLibraryData();

  if (load.status === 'loading') {
    return (
      <div className="site-page routes-page">
        <SiteHeader active="routes" onNavigate={onNavigateSite} />
        <div id="main-content" className="app-loading" role="status"><p>{locale === 'zh-TW' ? '載入航線資料中…' : 'Loading route data…'}</p></div>
      </div>
    );
  }

  if (load.status === 'error') {
    return (
      <div className="site-page routes-page">
        <SiteHeader active="routes" onNavigate={onNavigateSite} />
        <div id="main-content" className="app-error" role="alert"><h1>gcmp</h1><p>{load.error}</p></div>
      </div>
    );
  }

  return (
    <AllRoutesPage
      data={load.data}
      onNavigate={onNavigateSite}
      onPlanRoute={({ from, to, carrier, flightNumber }) => {
        const leg: FlightLeg = {
          from,
          to,
          operatingCarrier: carrier,
          ...(flightNumber ? { flightNumber } : {}),
        };
        void routeToPlanner(leg, onNavigateSite);
      }}
    />
  );
}
