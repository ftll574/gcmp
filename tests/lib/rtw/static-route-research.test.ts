import { expect, test } from 'vitest';
import { extractStaticRouteCandidates } from '../../../src/lib/rtw/static-route-research.ts';

test('extracts only known-airport target-carrier directional route candidates', () => {
  const result = extractStaticRouteCandidates({
    TPE: { iata: 'TPE', routes: [
      { iata: 'NRT', carriers: [{ iata: 'BR' }, { iata: 'ZZ' }] },
      { iata: 'XXX', carriers: [{ iata: 'BR' }] },
    ] },
    NRT: { iata: 'NRT', routes: [{ iata: 'TPE', carriers: [{ iata: 'NH' }] }] },
  }, {
    eligibleCarriers: new Set(['BR', 'NH']),
    knownAirports: new Set(['TPE', 'NRT']),
  });
  expect(result.routes).toEqual([
    { carrier: 'BR', from: 'TPE', to: 'NRT' },
    { carrier: 'NH', from: 'NRT', to: 'TPE' },
  ]);
  expect(result.stats).toMatchObject({ targetCarrierRoutes: 2, outsideAirportCatalog: 1 });
});
