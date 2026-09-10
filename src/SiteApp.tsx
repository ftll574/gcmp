import { lazy, Suspense, useEffect, useState } from 'react';
import { LandingPage } from './components/LandingPage.tsx';
import type { SiteView } from './components/SiteHeader.tsx';
import { useLocaleState } from './i18n/use-locale-state.ts';

const LazyPlannerApp = lazy(() =>
  import('./App.tsx').then((module) => ({ default: module.App })),
);
const LazyRoutesApp = lazy(() =>
  import('./RoutesApp.tsx').then((module) => ({ default: module.RoutesApp })),
);

function viewFromLocation(): SiteView {
  const explicit = new URLSearchParams(window.location.search).get('view');
  if (explicit === 'home' || explicit === 'planner' || explicit === 'routes') return explicit;
  return window.location.hash.startsWith('#/r/') ? 'planner' : 'home';
}

/**
 * Lightweight public entry point.
 *
 * A fresh homepage visit does not import the planner workbench or load its
 * datasets. The existing App module is pulled in only after the user enters
 * Planner / Route library or opens a legacy share hash directly.
 */
export function SiteApp(): React.ReactElement {
  const { locale } = useLocaleState();
  const [view, setView] = useState<SiteView>(viewFromLocation);

  useEffect(() => {
    const sync = (): void => setView(viewFromLocation());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const navigate = (next: SiteView): void => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', next);
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    setView(next);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (view === 'home') return <LandingPage onNavigate={navigate} />;

  return (
    <Suspense fallback={<div className="app-loading site-app-loading" role="status"><p>{locale === 'zh-TW' ? '載入中…' : 'Loading…'}</p></div>}>
      {view === 'routes'
        ? <LazyRoutesApp onNavigateSite={navigate} />
        : <LazyPlannerApp siteView="planner" onNavigateSite={navigate} />}
    </Suspense>
  );
}
