import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseRouteNetworkCatalog, RouteNetworkCatalogSchema, RouteNetworkEntrySchema } from '../../../src/lib/schemas/route-network.ts';

const catalogRaw = JSON.parse(readFileSync('public/data/route-network/current.json', 'utf8'));
const airportCodes = new Set<string>(JSON.parse(readFileSync('public/data/airports.json', 'utf8')).map((row: { iata: string }) => row.iata));
const source = { id: 'fixture', url: 'https://example.com/route', checkedOn: '2026-09-05', note: 'Fixture only, not production evidence.' };
const route = { carrier: 'CX', pair: ['TPE', 'HKG'], service: 'nonstop', status: 'published', sourceIds: ['fixture'] };
const fixture = { version: '2026.3', coverage: 'curated-not-complete', sources: [source], carrierUniverses: [], routes: [route] };

describe('route-network integrity', () => {
  test('every actual route resolves to known airports and primary-source records', () => {
    const catalog = parseRouteNetworkCatalog(catalogRaw, airportCodes);
    expect(catalog.routes).toHaveLength(725);
    expect(catalog.sources).toHaveLength(154);
    expect(new Set(catalog.routes.map((row) => row.carrier))).toEqual(new Set(['CX', 'AY', 'BA', 'AA', 'LH', 'UA', 'NH', 'JL', 'SQ', 'QR', 'QF', 'IB', 'AC', 'TK', 'MH', 'NZ', 'LX', 'OS', 'TG', 'AI', 'LO', 'ET', 'TP', 'CA', 'A3', 'RJ', 'AT', 'WY', 'CM', 'AS', 'HA', 'UL', 'SN', 'OU', 'AZ', 'AV', 'OZ', 'SA', 'MS', 'ZH', 'FJ', 'BR']));
    const domains = ['cathaypacific.com', 'finnair.com', 'britishairways.com', 'aa.com', 'lufthansa.com', 'ana.co.jp', 'jal.com', 'jal.co.jp', 'singaporeair.com', 'qatarairways.com', 'qantas.com', 'iberia.com', 'aircanada.com', 'turkishairlines.com', 'malaysiaairlines.com', 'airnewzealand.com', 'swiss.com', 'austrian.com', 'thaiairways.com', 'alaskaair.com', 'airindia.com', 'lot.com', 'ethiopianairlines.com', 'flytap.com', 'airchina.com.cn', 'aegeanair.com', 'aegeanhub.com', 'rj.com', 'royalairmaroc.com', 'omanair.com', 'copaair.com', 'srilankan.com', 'brusselsairlines.com', 'croatiaairlines.com', 'ita-airways.com', 'avianca.com', 'flyasiana.com', 'flysaa.com', 'egyptair.com', 'shenzhenair.com', 'fijiairways.com', 'dfwairport.com', 'evaair.com'];
    for (const item of catalog.sources) {
      const hostname = new URL(item.url).hostname;
      expect(domains.some((domain) => hostname === domain || hostname.endsWith('.' + domain))).toBe(true);
    }
    // Source-level validation is not a substitute for checking route evidence.
    expect(catalog.coverage).toBe('curated-not-complete');
  });

  test('carrier route-universe readiness is explicit and remains partial for every expanded carrier', () => {
    const catalog = parseRouteNetworkCatalog(catalogRaw);
    expect(catalog.carrierUniverses).toEqual(expect.arrayContaining([
      expect.objectContaining({ carrier: 'JL', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'NH', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'SQ', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'QR', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'QF', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'IB', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'AC', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'TK', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'MH', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'NZ', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'LX', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'OS', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'TG', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'AI', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'LO', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'ET', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'TP', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'CA', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'A3', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'RJ', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'AT', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'WY', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'CM', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'AS', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'HA', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'UL', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'SN', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'OU', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'AZ', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'AV', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'OZ', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'SA', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'BR', scope: 'partial', asOf: '2026-09-08' }),
      expect.objectContaining({ carrier: 'MS', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'ZH', scope: 'partial', asOf: '2026-09-06' }),
      expect.objectContaining({ carrier: 'FJ', scope: 'partial', asOf: '2026-09-06' }),
    ]));
    expect(catalog.carrierUniverses.some((universe) => universe.scope === 'complete')).toBe(false);
  });

  test('current EVA Bangkok service is retained as route evidence without inventing timetable fields', () => {
    const catalog = parseRouteNetworkCatalog(catalogRaw, airportCodes);
    expect(catalog.routes.find((route) => route.carrier === 'BR' && route.pair.join('-') === 'TPE-BKK')).toEqual({
      carrier: 'BR',
      pair: ['TPE', 'BKK'],
      service: 'nonstop',
      status: 'published',
      sourceIds: ['br-tpe-bkk-current'],
      effectiveFrom: '2026-09-08',
    });
    expect(catalog.routes.find((route) => route.carrier === 'BR' && route.pair.join('-') === 'BKK-TPE')).toEqual({
      carrier: 'BR',
      pair: ['BKK', 'TPE'],
      service: 'nonstop',
      status: 'published',
      sourceIds: ['br-bkk-tpe-current'],
      effectiveFrom: '2026-09-08',
    });
  });

  test('complete carrier universes require a denominator exactly pinned to represented active routes', () => {
    const complete = {
      ...fixture,
      carrierUniverses: [{
        carrier: 'CX',
        scope: 'complete',
        asOf: '2026-09-05',
        directionalRouteDenominator: 1,
        sourceIds: ['fixture'],
        note: 'Complete fixture with one represented directional route.',
      }],
    };
    expect(RouteNetworkCatalogSchema.safeParse(complete).success).toBe(true);
    expect(RouteNetworkCatalogSchema.safeParse({
      ...complete,
      carrierUniverses: [{ ...complete.carrierUniverses[0], directionalRouteDenominator: 2 }],
    }).success).toBe(false);
  });

  test('does not silently accept invented schedule or availability fields', () => {
    expect(RouteNetworkEntrySchema.safeParse({ ...route, daysOfWeek: [1, 2, 3, 4, 5, 6, 7] }).success).toBe(false);
    expect(RouteNetworkEntrySchema.safeParse({ ...route, awardSeats: 2 }).success).toBe(false);
  });

  test('allows a provider-listed carrier without pretending it is operating evidence', () => {
    expect(RouteNetworkEntrySchema.parse({ ...route, carrierIdentity: 'provider-listed' }).carrierIdentity).toBe('provider-listed');
    expect(RouteNetworkEntrySchema.safeParse({ ...route, carrierIdentity: 'marketing' }).success).toBe(false);
  });

  test.each([
    ['missing sources', { ...fixture, sources: [] }],
    ['unknown source', { ...fixture, routes: [{ ...route, sourceIds: ['missing'] }] }],
    ['duplicate source', { ...fixture, sources: [source, source] }],
    ['duplicate route', { ...fixture, routes: [route, route] }],
    ['invalid checked date', { ...fixture, sources: [{ ...source, checkedOn: '2026-02-30' }] }],
    ['unpublished source', { ...fixture, sources: [{ ...source, publishedOn: '2026-09-06' }] }],
    ['insecure source URL', { ...fixture, sources: [{ ...source, url: 'http://example.com' }] }],
    ['unknown carrier-universe source', { ...fixture, carrierUniverses: [{ carrier: 'CX', scope: 'partial', asOf: '2026-09-05', sourceIds: ['missing'], note: 'Incomplete fixture.' }] }],
    ['complete carrier universe without denominator', { ...fixture, carrierUniverses: [{ carrier: 'CX', scope: 'complete', asOf: '2026-09-05', sourceIds: ['fixture'], note: 'Incomplete complete fixture.' }] }],
    ['partial carrier universe with denominator', { ...fixture, carrierUniverses: [{ carrier: 'CX', scope: 'partial', asOf: '2026-09-05', directionalRouteDenominator: 1, sourceIds: ['fixture'], note: 'Invalid partial fixture.' }] }],
    ['duplicate carrier universe', { ...fixture, carrierUniverses: [
      { carrier: 'CX', scope: 'partial', asOf: '2026-09-05', sourceIds: ['fixture'], note: 'First fixture.' },
      { carrier: 'CX', scope: 'complete', asOf: '2026-09-05', directionalRouteDenominator: 1, sourceIds: ['fixture'], note: 'Second fixture.' },
    ] }],
  ])('rejects %s', (_label, raw) => {
    expect(RouteNetworkCatalogSchema.safeParse(raw).success).toBe(false);
  });

  test.each([
    ['identical endpoints', { ...route, pair: ['HKG', 'HKG'] }],
    ['duplicate references', { ...route, sourceIds: ['fixture', 'fixture'] }],
    ['inverted dates', { ...route, effectiveFrom: '2026-11-01', effectiveUntil: '2026-10-31' }],
    ['invalid airport syntax', { ...route, pair: ['HKG', 'Hong Kong'] }],
  ])('rejects %s on a route', (_label, raw) => {
    expect(RouteNetworkEntrySchema.safeParse(raw).success).toBe(false);
  });

  test('rejects an unrecognized airport instead of silently rendering a dead button', () => {
    expect(() => parseRouteNetworkCatalog(fixture, new Set(['TPE']))).toThrow('unknown airport HKG');
    expect(parseRouteNetworkCatalog(fixture, new Set(['TPE', 'HKG'])).routes).toHaveLength(1);
  });

  test('does not expand uncertain reverse flights, codeshares or rail connections', () => {
    const catalog = parseRouteNetworkCatalog(catalogRaw);
    const keys = new Set(catalog.routes.map((item) => `${item.carrier}:${item.pair.join('-')}`));
    expect(keys.has('AY:HKG-HEL')).toBe(true);
    expect(keys.has('AY:HEL-HKG')).toBe(false);
    expect(keys.has('AY:LHR-HEL')).toBe(false);
    expect(keys.has('CX:HKG-BCN')).toBe(false);
    expect(keys.has('QR:DOH-HKG')).toBe(true);
    expect(keys.has('QR:HKG-DOH')).toBe(true);
    expect(keys.has('QR:DOH-LGW')).toBe(false);
    expect(keys.has('QF:SYD-LAX')).toBe(true);
    expect(keys.has('QF:LAX-SYD')).toBe(true);
    expect(keys.has('QF:SYD-LHR')).toBe(false);
    expect(keys.has('MH:KUL-TPE')).toBe(true);
    expect(keys.has('MH:TPE-KUL')).toBe(false);
    expect(keys.has('NZ:AKL-CNS')).toBe(true);
    expect(keys.has('NZ:CHC-PER')).toBe(true);
    expect(catalog.routes.find((row) => row.carrier === 'NZ' && row.pair.join('-') === 'CHC-PER')?.effectiveFrom).toBe('2026-12-01');
    expect(keys.has('NZ:AKL-ORD')).toBe(false);
    expect(keys.has('LX:ZRH-HKG')).toBe(true);
    expect(keys.has('OS:VIE-NRT')).toBe(true);
    expect(keys.has('OS:VIE-HND')).toBe(false);
    expect(keys.has('OS:VIE-BOS')).toBe(true);
    expect(keys.has('OS:BOS-VIE')).toBe(true);
    expect(keys.has('OS:VIE-ORD')).toBe(true);
    expect(keys.has('OS:ORD-VIE')).toBe(true);
    expect(keys.has('OS:VIE-IAD')).toBe(true);
    expect(keys.has('OS:IAD-VIE')).toBe(true);
    expect(keys.has('OS:VIE-JFK')).toBe(true);
    expect(keys.has('OS:JFK-VIE')).toBe(true);
    expect(keys.has('OS:VIE-EWR')).toBe(true);
    expect(keys.has('OS:EWR-VIE')).toBe(true);
    expect(keys.has('OS:VIE-NYC')).toBe(false);
    expect(keys.has('TG:BKK-TPE')).toBe(true);
    expect(keys.has('TG:TPE-BKK')).toBe(false);
    expect(keys.has('SQ:SIN-KTI')).toBe(true);
    expect(keys.has('SQ:SIN-MXP')).toBe(true);
    expect(keys.has('SQ:SIN-JNB')).toBe(true);
    expect(keys.has('SQ:MXP-SIN')).toBe(false);
    expect(keys.has('SQ:SIN-CPT')).toBe(false);
    expect(keys.has('SQ:SIN-LAX')).toBe(false);
    expect(keys.has('SQ:SIN-KHH')).toBe(false);
    expect(keys.has('SQ:SIN-PQC')).toBe(false);
    expect(keys.has('SQ:SIN-PEK')).toBe(false);
    expect(keys.has('SQ:SIN-PKX')).toBe(false);
    expect(keys.has('AS:SEA-NRT')).toBe(false);
    expect(keys.has('AT:CMN-JFK')).toBe(true);
    expect(keys.has('AT:JFK-CMN')).toBe(false);
    expect(keys.has('WY:MCT-SIN')).toBe(true);
    expect(keys.has('WY:SIN-MCT')).toBe(true);
    expect(keys.has('WY:MCT-TIF')).toBe(true);
    expect(keys.has('WY:TIF-MCT')).toBe(true);
    expect(keys.has('WY:MCT-AER')).toBe(true);
    expect(keys.has('WY:AER-MCT')).toBe(true);
    expect(keys.has('CM:PTY-DAV')).toBe(true);
    expect(keys.has('AS:SFO-SEA')).toBe(true);
    expect(keys.has('HA:HNL-HND')).toBe(true);
    expect(keys.has('UL:CMB-LHR')).toBe(true);
    expect(keys.has('SN:BRU-JFK')).toBe(true);
    expect(keys.has('SN:BRU-EWR')).toBe(false);
    expect(keys.has('OU:LHR-ZAG')).toBe(true);
    expect(keys.has('OU:ATH-DBV')).toBe(true);
    expect(keys.has('OU:DBV-ATH')).toBe(true);
    expect(keys.has('OU:LHR-SPU')).toBe(true);
    expect(keys.has('OU:SPU-LHR')).toBe(true);
    expect(keys.has('OU:FCO-SPU')).toBe(true);
    expect(keys.has('OU:SPU-FCO')).toBe(true);
    expect(keys.has('OU:ATH-ZAG')).toBe(false);
    expect(keys.has('OU:CPH-DBV')).toBe(false);
    expect(keys.has('OU:ZAG-FCO')).toBe(false);
    expect(keys.has('OU:LHR-DBV')).toBe(false);
    expect(keys.has('AZ:FCO-JFK')).toBe(true);
    expect(keys.has('AV:MAD-SAL')).toBe(true);
    expect(keys.has('OZ:ICN-LAX')).toBe(true);
    expect(keys.has('SA:JNB-ACC')).toBe(true);
    expect(keys.has('MS:CAI-IAD')).toBe(true);
    expect(keys.has('ZH:SZX-TPE')).toBe(true);
    expect(keys.has('ZH:TPE-SZX')).toBe(true);
    expect(keys.has('FJ:NAN-DFW')).toBe(true);
    expect(keys.has('FJ:DFW-NAN')).toBe(true);
    expect(keys.has('AI:DEL-HND')).toBe(true);
    expect(keys.has('AI:HND-BOM')).toBe(true);
    expect(keys.has('AI:DEL-HAN')).toBe(true);
    expect(catalog.routes.find((row) => row.carrier === 'AI' && row.pair.join('-') === 'DEL-DOH')?.status).toBe('suspended');
    expect(keys.has('LO:WAW-SFO')).toBe(true);
    expect(keys.has('LO:SFO-WAW')).toBe(true);
    expect(catalog.routes.find((row) => row.carrier === 'LO' && row.pair.join('-') === 'WAW-SFO')).toMatchObject({
      effectiveFrom: '2026-05-06', effectiveUntil: '2026-10-22',
    });
    expect(catalog.routes.find((row) => row.carrier === 'LO' && row.pair.join('-') === 'SFO-WAW')).toMatchObject({
      effectiveFrom: '2026-05-06', effectiveUntil: '2026-10-22',
    });
    expect(keys.has('LO:WAW-ALA')).toBe(true);
    expect(keys.has('LO:ALA-WAW')).toBe(true);
    expect(keys.has('LO:GDN-BRU')).toBe(true);
    expect(keys.has('LO:BRU-GDN')).toBe(true);
    expect(keys.has('LO:GDN-OSL')).toBe(true);
    expect(keys.has('LO:OSL-GDN')).toBe(true);
    expect(keys.has('LO:KRK-FCO')).toBe(true);
    expect(keys.has('LO:FCO-KRK')).toBe(true);
    expect(keys.has('LO:KRK-BCN')).toBe(true);
    expect(keys.has('LO:BCN-KRK')).toBe(true);
    expect(keys.has('LO:KRK-MAD')).toBe(true);
    expect(keys.has('LO:MAD-KRK')).toBe(true);
    expect(keys.has('LO:GDN-BGO')).toBe(false);
    expect(keys.has('LO:WAW-BKK')).toBe(false);
    expect(keys.has('LO:WAW-OPO')).toBe(true);
    expect(keys.has('LO:OPO-WAW')).toBe(true);
    expect(keys.has('ET:ADD-MRU')).toBe(true);
    expect(keys.has('ET:MRU-ADD')).toBe(true);
    expect(keys.has('ET:ADD-ATL')).toBe(true);
    expect(keys.has('ET:ATL-ADD')).toBe(true);
    expect(keys.has('TP:LIS-GRU')).toBe(true);
    expect(keys.has('TP:GRU-LIS')).toBe(true);
    expect(keys.has('TP:LIS-LHR')).toBe(true);
    expect(keys.has('TP:GIG-LIS')).toBe(true);
    expect(keys.has('TP:LIS-GIG')).toBe(true);
    expect(keys.has('TP:LIS-ORY')).toBe(true);
    expect(keys.has('TG:BKK-HKG')).toBe(true);
    expect(keys.has('TG:BKK-NRT')).toBe(true);
    expect(keys.has('TG:BKK-HND')).toBe(true);
    expect(keys.has('TG:BKK-LHR')).toBe(true);
    expect(keys.has('TG:HKG-BKK')).toBe(false);
    expect(keys.has('CA:SZX-FRA')).toBe(true);
    expect(keys.has('CA:FRA-SZX')).toBe(false);
    expect(keys.has('A3:ATH-LHR')).toBe(true);
    expect(keys.has('A3:LHR-ATH')).toBe(false);
    expect(keys.has('A3:MAD-ATH')).toBe(true);
    expect(keys.has('A3:ATH-MAD')).toBe(true);
    expect(keys.has('A3:ATH-LCA')).toBe(true);
    expect(keys.has('A3:ATH-JNX')).toBe(false);
    expect(keys.has('RJ:AMM-VIE')).toBe(true);
    expect(keys.has('RJ:VIE-AMM')).toBe(true);
    expect(keys.has('RJ:AMM-HBE')).toBe(true);
    expect(keys.has('RJ:HBE-AMM')).toBe(true);
    expect(keys.has('RJ:AMM-YYZ')).toBe(false);
    expect(keys.has('RJ:YUL-YYZ')).toBe(false);
    expect(keys.has('RJ:AMM-MRA')).toBe(false);
    expect(keys.has('RJ:ADJ-SSH')).toBe(true);
    expect(keys.has('RJ:SSH-ADJ')).toBe(true);
    expect(keys.has('RJ:AMM-SSH')).toBe(false);
    expect(keys.has('RJ:ADJ-IST')).toBe(true);
    expect(keys.has('RJ:IST-ADJ')).toBe(false);
    expect(keys.has('LX:ZRH-SIN')).toBe(true);
    expect(keys.has('LX:SIN-ZRH')).toBe(true);
    expect(keys.has('LX:GVA-JFK')).toBe(true);
    expect(keys.has('LX:JFK-GVA')).toBe(true);
    expect(keys.has('LX:GVA-EWR')).toBe(false);
    expect(keys.has('LX:ZRH-QLS')).toBe(false);
    expect(keys.has('OZ:ICN-TPE')).toBe(true);
    expect(keys.has('OZ:TPE-ICN')).toBe(true);
    expect(keys.has('OZ:GMP-HND')).toBe(true);
    expect(keys.has('OZ:HND-GMP')).toBe(true);
    expect(keys.has('OZ:ICN-MXP')).toBe(true);
    const ozUniverse = catalog.carrierUniverses.find((universe) => universe.carrier === 'OZ');
    expect(ozUniverse?.scope).toBe('partial');
    expect(ozUniverse).not.toHaveProperty('directionalRouteDenominator');
    const sqUniverse = catalog.carrierUniverses.find((universe) => universe.carrier === 'SQ');
    expect(sqUniverse?.scope).toBe('partial');
    expect(sqUniverse).not.toHaveProperty('directionalRouteDenominator');
    const ouUniverse = catalog.carrierUniverses.find((universe) => universe.carrier === 'OU');
    expect(ouUniverse?.scope).toBe('partial');
    expect(ouUniverse).not.toHaveProperty('directionalRouteDenominator');
    expect(catalog.routes.some((row) => row.pair.includes('ZMU') || row.carrier === 'XX' || row.carrier === '4Y')).toBe(false);
  });

  test('keeps explicit operator and seasonal controls bounded', () => {
    const catalog = parseRouteNetworkCatalog(catalogRaw);
    const cairns = catalog.routes.find((row) => row.carrier === 'NZ' && row.pair.join('-') === 'AKL-CNS');
    expect(cairns).toMatchObject({ effectiveFrom: '2026-03-29', effectiveUntil: '2026-10-13' });

    const alaskaNegative = catalog.sources.find((source) => source.id === 'as-sea-nrt-hawaiian-operator');
    expect(alaskaNegative?.note).toContain('operated by Hawaiian Airlines');
    expect(catalog.sources.find((source) => source.id === 'as-823-2026-09-05-hawaiian-operator')?.note).toContain('operated by Hawaiian Airlines');
    expect(catalog.sources.find((source) => source.id === 'as-824-2026-09-06-hawaiian-operator')?.note).toContain('operated by Hawaiian Airlines');

    const austrianNegative = catalog.sources.find((source) => source.id === 'os-vie-nrt-flightplan');
    expect(austrianNegative?.note).toContain('operated by NH');
    expect(catalog.sources.find((source) => source.id === 'os-vie-nyc-flightplan')?.note).toContain('never creates a generic NYC route');

    const lotMixedMap = catalog.sources.find((source) => source.id === 'lo-mixed-route-map-negative');
    expect(lotMixedMap?.note).toContain('partner-airline codeshare');
    expect(lotMixedMap?.note).toContain('up to two stops');
    expect(catalog.sources.find((source) => source.id === 'lo-gdn-regional-2026')?.note).toContain('Bergen is withheld');

    const omanNetwork = catalog.sources.find((source) => source.id === 'wy-2026-network-expansion');
    expect(omanNetwork?.note).toContain('49 destinations');
    expect(omanNetwork?.note).toContain('not used as a directional route denominator');

    expect(catalog.sources.find((source) => source.id === 'tg-early-escape-2026-operated-nonstop')?.note).toContain('TG 3-digit operating flights only');
    expect(catalog.sources.find((source) => source.id === 'tp-current-nonstop-pairs')?.note).toContain('direct non-stop flights');

    const singaporeNetwork = catalog.sources.find((source) => source.id === 'sq-current-sin-nonstop-network-2026-09-06');
    expect(singaporeNetwork?.note).toContain('Multi-airport city aggregates');
    expect(singaporeNetwork?.note).toContain('No reverse direction is inferred');
    expect(catalog.sources.find((source) => source.id === 'sq-sin-cpt-one-stop-negative')?.note).toContain('one-stop via Johannesburg');

    const croatiaOperator = catalog.sources.find((source) => source.id === 'ou-current-operated-checkin');
    expect(croatiaOperator?.note).toContain('operated by Croatia Airlines');
    expect(catalog.sources.find((source) => source.id === 'ou-lhr-zag-2026')?.note).toContain('via Zagreb');
    expect(catalog.sources.find((source) => source.id === 'ou-rome-to-2026')?.note).toContain('via Split/Dubrovnik');

    const airIndiaSuspension = catalog.sources.find((source) => source.id === 'ai-current-middle-east-suspension');
    expect(airIndiaSuspension?.note).toContain('all Air India flights to all Middle East destinations are suspended');

    const royalJordanianTimetable = catalog.sources.find((source) => source.id === 'rj-september-2026-quick-reference');
    expect(royalJordanianTimetable?.note).toContain('YYZ is the only * one-stop city row');
    expect(royalJordanianTimetable?.note).toContain('contain no # marker');
    expect(catalog.sources.find((source) => source.id === 'rj-alexandria-code-transition')?.note).toContain('HBE for travel 2026-08-08 through 2026-09-15');

    const swissNewYork = catalog.sources.find((source) => source.id === 'lx-zrh-nyc-flightplan');
    expect(swissNewYork?.note).toContain('LX3218/3219 are explicitly labeled operated by UA');
    expect(catalog.sources.find((source) => source.id === 'lx-zrh-gva-flightplan')?.note).toContain('SBB rail-marketed LX rows');
  });
});
