export type PublicSiteView = 'home' | 'planner' | 'routes';

export function siteViewHref(view: PublicSiteView): string {
  const url = new URL(window.location.href);
  url.searchParams.set('view', view);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function shouldHandleSiteLink(event: Pick<MouseEvent, 'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}
