import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { MarketProfileSchema } from '../../../src/lib/schemas/market.ts';

const taiwan = MarketProfileSchema.parse(
  JSON.parse(readFileSync('public/data/markets/tw/current.json', 'utf8')),
);

describe('MarketProfileSchema', () => {
  test('validates the Taiwan-first market profile', () => {
    expect(taiwan.market).toBe('TW');
    expect(taiwan.defaultLocale).toBe('zh-TW');
    expect(taiwan.primaryAirports).toEqual(expect.arrayContaining(['TPE', 'TSA', 'KHH']));
  });

  test('prioritizes Taiwan home airlines', () => {
    expect(taiwan.priorityAirlines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ airline: 'BR', rtwRelevance: 'primary' }),
        expect.objectContaining({ airline: 'CI', rtwRelevance: 'limited' }),
        expect.objectContaining({ airline: 'JX', rtwRelevance: 'limited' }),
      ]),
    );
  });

  test('prioritizes Taiwan-first RTW award products', () => {
    expect(taiwan.priorityPrograms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'br-infinity-star-alliance-world-travel-award',
          rtwRelevance: 'primary',
        }),
        expect.objectContaining({
          id: 'cx-asia-miles-oneworld-multi-carrier-award',
          rtwRelevance: 'primary',
        }),
      ]),
    );
  });

  test('marks China Airlines as important but not a true RTW candidate', () => {
    expect(taiwan.priorityPrograms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ci-dynasty-flyer',
          rtwRelevance: 'negative',
        }),
      ]),
    );
  });

  test('keeps ANA RTW award as watch because new ticket issuance ended', () => {
    expect(taiwan.priorityPrograms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'nh-mileage-club',
          rtwRelevance: 'watch',
        }),
      ]),
    );
  });
});
