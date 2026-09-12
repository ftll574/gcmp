import { describe, expect, it } from 'vitest';
import { resolveRouteBuildDate } from '../../../src/lib/rtw/route-build-date.ts';

describe('route runtime build date', () => {
  it('uses the supplied as-of date for reproducible refreshes', () => {
    expect(resolveRouteBuildDate('2026-09-12')).toBe('2026-09-12');
  });

  it('defaults to the current UTC date when no date is supplied', () => {
    expect(resolveRouteBuildDate(undefined, new Date('2026-09-12T23:59:59Z'))).toBe('2026-09-12');
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => resolveRouteBuildDate('2026/09/12')).toThrow(/YYYY-MM-DD/);
    expect(() => resolveRouteBuildDate('2026-13-40')).toThrow(/YYYY-MM-DD/);
  });
});
