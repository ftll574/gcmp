import { afterEach, describe, expect, it } from 'vitest';
import { siteAssetHref, siteRouteEntityHref, siteViewHref } from '../../src/lib/site-navigation.ts';

afterEach(() => window.history.replaceState({}, '', '/'));

describe('site paths under a GitHub Pages base', () => {
  it('prefixes public assets with the configured base path', () => {
    expect(siteAssetHref('/status/data-progress.json', '/gcmp/')).toBe('/gcmp/status/data-progress.json');
    expect(siteAssetHref('data/published-timetables/caa/index.json', '/gcmp/')).toBe('/gcmp/data/published-timetables/caa/index.json');
  });

  it('keeps the current base path and unrelated query/hash state when opening a route reference', () => {
    window.history.replaceState({}, '', '/?view=progress&lang=zh-TW#/r/preserved');
    expect(siteRouteEntityHref('TSA-KNH', '/gcmp/')).toBe('/gcmp/?view=routes&lang=zh-TW&entity=route&id=TSA-KNH#/r/preserved');
  });

  it('keeps direct view navigation under the current base path', () => {
    window.history.replaceState({}, '', '/?view=progress&lang=zh-TW#/r/preserved');
    expect(siteViewHref('routes', '/gcmp/')).toBe('/gcmp/?view=routes&lang=zh-TW#/r/preserved');
  });
});
