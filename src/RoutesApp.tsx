import { AllRoutesPage } from './components/AllRoutesPage.tsx';
import { SiteHeader, type SiteView } from './components/SiteHeader.tsx';
import { useLocaleState } from './i18n/use-locale-state.ts';
import type { FlightLeg, RoutingRequest } from './lib/types.ts';
import { useRouteLibraryData } from './state/use-route-library-data.ts';

interface Props {
  readonly onNavigateSite: (view: SiteView) => void;
}

function routeLoadingContext(): { readonly kind: 'airport' | 'airline' | 'route' | 'network'; readonly id: string } {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get('entity');
  const id = params.get('id')?.toUpperCase() ?? '';
  if (kind === 'airport' && /^[A-Z]{3}$/.test(id)) return { kind, id };
  if (kind === 'airline' && /^[A-Z0-9]{2,3}$/.test(id)) return { kind, id };
  if (kind === 'route' && /^[A-Z]{3}-[A-Z]{3}$/.test(id)) return { kind, id };
  return { kind: 'network', id: '' };
}

function RouteCoreLoading({ locale }: { readonly locale: 'en' | 'zh-TW' }): React.ReactElement {
  const context = routeLoadingContext();
  const zh = locale === 'zh-TW';
  const label = context.kind === 'airport'
    ? (zh ? '機場' : 'Airport')
    : context.kind === 'airline'
      ? (zh ? '航空公司' : 'Airline')
      : context.kind === 'route'
        ? (zh ? '航線' : 'Route')
        : (zh ? '航線資料庫' : 'Route library');
  const title = context.kind === 'route'
    ? context.id.replace('-', ' → ')
    : context.id || (zh ? '探索全球航網' : 'Explore the global route network');

  return (
    <main id="main-content" className="routes-page-main route-progressive-shell" aria-busy="true">
      <section className="routes-page-intro">
        <span className="routes-page-kicker">{zh ? '航線資料庫' : 'Route library'}</span>
        <h1>{zh ? '探索全球航網' : 'Explore the global route network'}</h1>
        <p>{zh ? '正在準備機場與航空聯盟資料。' : 'Preparing airport and alliance data.'}</p>
      </section>
      <section className="route-context-loading" role="status" aria-live="polite">
        <div className="route-context-loading__hero">
          <span>{label}</span>
          <strong>{title}</strong>
          <small>{zh ? '先建立頁面，航網資料會接著補上。' : 'Setting up the page while the route network follows.'}</small>
        </div>
        <div className="route-context-loading__map" aria-hidden="true"><i /><i /><i /></div>
      </section>
    </main>
  );
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
        <RouteCoreLoading locale={locale} />
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
