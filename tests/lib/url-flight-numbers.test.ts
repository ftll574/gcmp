import { expect, test } from 'vitest';
import { encodeShareUrl, parseShareUrl } from '../../src/lib/url-schema.ts';

const base = '/r/v1/TPE-HKG-LHR?op=CX,BA&p=CX&c=J&d=2026-09-07,2026-09-10';
test('flight-number suffixes and empty cells round-trip with dates and multi-group links', () => {
  for (const url of [base + '&fn=473,', '/r/v1/TPE-HKG,LHR-JFK?op=CX;BA&p=CX&c=J&d=2026-09-07;2026-09-10&fn=473;117A']) {
    const parsed = parseShareUrl(url); expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parseShareUrl(encodeShareUrl(parsed.request))).toEqual(parsed);
  }
});
test.each(['&fn=473', '&fn=473,001,55', '&fn=473;55', '&fn=CX473,', '&fn=12345,', '&fn=<script>,'])('rejects invalid flight references %s', (extra) => expect(parseShareUrl(base + extra).ok).toBe(false));
test('flight references may be selected before a date, but never on a surface leg', () => {
  const undated = parseShareUrl('/r/v1/TPE-HKG?op=CX&p=CX&c=J&fn=473');
  expect(undated.ok).toBe(true);
  if (undated.ok) {
    expect(undated.request.groups[0]?.legs[0]?.flightNumber).toBe('473');
    expect(undated.request.groups[0]?.legs[0]?.departsOn).toBeUndefined();
    expect(parseShareUrl(encodeShareUrl(undated.request))).toEqual(undated);
  }
  expect(parseShareUrl(base + '&fn=473,&surf=1,0').ok).toBe(false);
  const parsed = parseShareUrl(base); expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(encodeShareUrl(parsed.request)).not.toContain('fn=');
});
