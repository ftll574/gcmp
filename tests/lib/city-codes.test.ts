import { describe, expect, test } from 'vitest';
import {
  cityCodeForAirport,
  cityCodeLabel,
  metropolitanAirportsFor,
  resolveCityCode,
} from '../../src/lib/city-codes.ts';

describe('IATA metropolitan area helpers', () => {
  test('Tokyo groups production-realistic NRT and HND even though municipality names differ', () => {
    expect(resolveCityCode('TYO')).toEqual(['HND', 'NRT']);
    expect(cityCodeForAirport('NRT')).toBe('TYO');
    expect(cityCodeForAirport('HND')).toBe('TYO');
    expect(metropolitanAirportsFor('NRT')).toEqual(['HND', 'NRT']);
    expect(cityCodeLabel('TYO')).toBe('Tokyo');
  });

  test('physical airports without a curated metropolitan group stay ungrouped', () => {
    expect(cityCodeForAirport('SFO')).toBeNull();
    expect(metropolitanAirportsFor('SFO')).toEqual([]);
  });

  test('Taipei groups TPE and TSA without turning physical TPE into an autocomplete city code', () => {
    expect(resolveCityCode('TPE')).toBeNull();
    expect(cityCodeForAirport('TPE')).toBe('TPE');
    expect(cityCodeForAirport('TSA')).toBe('TPE');
    expect(metropolitanAirportsFor('TPE')).toEqual(['TPE', 'TSA']);
    expect(cityCodeLabel('TPE')).toBe('Taipei');
  });
});
