export type PublicSiteView = 'home' | 'planner' | 'routes';

export function siteViewFromLocation(): PublicSiteView {
  const url = new URL(window.location.href);
  const explicit = url.searchParams.get('view');
  if (explicit === 'progress') {
    url.searchParams.set('view', 'planner');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    return 'planner';
  }
  if (explicit === 'home' || explicit === 'planner' || explicit === 'routes') return explicit;
  return url.hash.startsWith('#/r/') ? 'planner' : 'home';
}

export function siteViewHref(view: PublicSiteView, base = import.meta.env.BASE_URL): string {
  const url = new URL(window.location.href);
  url.pathname = new URL(base, window.location.origin).pathname;
  url.searchParams.set('view', view);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function siteAssetHref(assetPath: string, base = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${assetPath.replace(/^\/+/, '')}`;
}

export function siteRouteEntityHref(routeId: string, base = import.meta.env.BASE_URL): string {
  const url = new URL(window.location.href);
  url.pathname = new URL(base, window.location.origin).pathname;
  url.searchParams.set('view', 'routes');
  url.searchParams.set('entity', 'route');
  url.searchParams.set('id', routeId);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function shouldHandleSiteLink(event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
