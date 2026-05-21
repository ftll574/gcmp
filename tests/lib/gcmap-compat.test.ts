import { describe, expect, test } from 'vitest';
import { isGcmapUrl, parseGcmapUrl } from '../../src/lib/gcmap-compat.ts';

describe('isGcmapUrl', () => {
  test('recognizes gcmap.com URL', () => {
    expect(isGcmapUrl('http://www.gcmap.com/mapui?P=SFO-NRT-BKK')).toBe(true);
    expect(isGcmapUrl('https://gcmap.com/mapui?P=SFO-NRT')).toBe(true);
  });

  test('recognizes bare paths string', () => {
    expect(isGcmapUrl('SFO-NRT-BKK')).toBe(true);
    expect(isGcmapUrl('SFO-NRT,JFK-LHR')).toBe(true);
  });

  test('rejects unrelated URLs', () => {
    expect(isGcmapUrl('https://google.com/maps')).toBe(false);
    expect(isGcmapUrl('not a routing')).toBe(false);
  });
});

describe('parseGcmapUrl', () => {
  test('parses single-group gcmap.com URL', () => {
    const req = parseGcmapUrl('http://www.gcmap.com/mapui?P=SFO-NRT-BKK');
    expect(req).not.toBeNull();
    expect(req?.groups.length).toBe(1);
    expect(req?.groups[0]?.legs.length).toBe(2);
    expect(req?.groups[0]?.legs[0]?.from).toBe('SFO');
    expect(req?.groups[0]?.legs[1]?.to).toBe('BKK');
  });

  test('parses multi-group gcmap.com URL', () => {
    const req = parseGcmapUrl('http://www.gcmap.com/mapui?P=SFO-NRT,JFK-LHR');
    expect(req).not.toBeNull();
    expect(req?.groups.length).toBe(2);
    expect(req?.groups[1]?.legs[0]?.from).toBe('JFK');
  });

  test('parses bare paths string with multiple groups', () => {
    const req = parseGcmapUrl('SFO-NRT-BKK,LAX-HKG');
    expect(req).not.toBeNull();
    expect(req?.groups.length).toBe(2);
    expect(req?.groups[0]?.legs.length).toBe(2);
    expect(req?.groups[1]?.legs.length).toBe(1);
  });

  test('handles lowercase input by uppercasing', () => {
    const req = parseGcmapUrl('sfo-nrt');
    expect(req).not.toBeNull();
    expect(req?.groups[0]?.legs[0]?.from).toBe('SFO');
  });

  test('fills in business cabin + both programs as defaults', () => {
    const req = parseGcmapUrl('SFO-NRT');
    expect(req?.cabin).toBe('business');
    expect(req?.programs).toEqual(['aa-aadvantage', 'as-mileage-plan']);
  });

  test('honors operating-carrier default override', () => {
    const req = parseGcmapUrl('SFO-NRT', { operatingCarrier: 'JL' });
    expect(req?.groups[0]?.legs[0]?.operatingCarrier).toBe('JL');
  });

  test('rejects malformed input', () => {
    expect(parseGcmapUrl('not a routing')).toBeNull();
    expect(parseGcmapUrl('SFO')).toBeNull(); // single airport, no legs
    expect(parseGcmapUrl('SFO-XX')).toBeNull(); // XX is not valid IATA
  });

  test('rejects empty input', () => {
    expect(parseGcmapUrl('')).toBeNull();
  });
});
