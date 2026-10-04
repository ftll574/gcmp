export type PublicSiteView = 'home' | 'planner' | 'routes' | 'progress';

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
