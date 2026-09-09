import { describe, expect, test } from 'vitest';
import raw from '../../public/data/official-schedules.json';
import airports from '../../public/data/airports.json';
import routeNetworkRaw from '../../public/data/route-network/current.json';
import { OfficialScheduleCatalogSchema, PublishedFlightSchema } from '../../src/lib/schemas/published-schedules.ts';
import { FlightQueryResponseSchema, selectedDepartureDate } from '../../src/lib/schemas/dated-schedules.ts';
import { mergeOfficialSchedules, publishedFlightsOn, queryOfficialSchedules } from '../../src/lib/rtw/official-schedules.ts';
import { flightDayView } from '../../src/lib/rtw/dated-flight-status.ts';
import { withOfficialRoutes } from '../../src/lib/rtw/official-route-discovery.ts';
import { buildNextLegIndex } from '../../src/lib/rtw/next-leg-discovery.ts';
import { parseRouteNetworkCatalog } from '../../src/lib/schemas/route-network.ts';

const NOW = Date.parse('2026-09-05T14:00:00Z');
const catalog = OfficialScheduleCatalogSchema.parse(raw);
const query = { from: 'NRT', to: 'BRU', start: '2026-09-07', end: '2026-09-08' };
const NH = new Set(['NH']);
const occurrence = (date: string) => publishedFlightsOn(catalog, query, date, NOW);

describe('official publication dates (actual source facts, not synthetic schedule data)', () => {
  test('catalog airport references resolve, and all rows have sources', () => {
    const codes = new Set(airports.map((airport) => airport.iata));
    expect(catalog.services.length).toBeGreaterThanOrEqual(71);
    for (const row of catalog.services) { expect(codes.has(row.from) && codes.has(row.to)).toBe(true); expect(catalog.sources[row.sourceId]).toBeDefined(); }
    expect(catalog.flightNumberReferences.length).toBeGreaterThanOrEqual(88);
    for (const row of catalog.flightNumberReferences) {
      expect(codes.has(row.from) && codes.has(row.to)).toBe(true);
      expect(catalog.sources[row.sourceId]).toBeDefined();
    }
  });
  test('Cathay Seattle publication exposes CX852/CX853 as dated schedule-backed services', () => {
    const now = Date.parse('2026-09-07T12:46:00Z');
    expect(publishedFlightsOn(catalog, { from: 'HKG', to: 'SEA' }, '2026-09-07', now)
      .map((flight) => `${flight.carrier}${flight.flightNumber}`)).toContain('CX852');
    expect(publishedFlightsOn(catalog, { from: 'SEA', to: 'HKG' }, '2026-09-07', now)
      .map((flight) => `${flight.carrier}${flight.flightNumber}`)).toContain('CX853');
    expect(publishedFlightsOn(catalog, { from: 'HKG', to: 'SEA' }, '2026-09-11', now)
      .filter((flight) => flight.carrier === 'CX')).toEqual([]);
  });
  test('flight-number references preserve exact designators without inventing weekdays', () => {
    const tpeSin = catalog.flightNumberReferences.find((row) => row.id === 'sq-tpe-sin-2026');
    const hkgSfo = catalog.flightNumberReferences.find((row) => row.id === 'cx-hkg-sfo-2026');
    expect(tpeSin).toMatchObject({ carrier: 'SQ', from: 'TPE', to: 'SIN', flightNumbers: ['877'] });
    expect(hkgSfo).toMatchObject({ carrier: 'CX', from: 'HKG', to: 'SFO', flightNumbers: ['872'] });
    expect('daysOfWeek' in (tpeSin ?? {})).toBe(false);
  });
  test('EVA TPE-BKK exposes current operating flight numbers and excludes the TG-operated BR2217 codeshare', () => {
    expect(catalog.flightNumberReferences
      .filter((row) => row.carrier === 'BR' && row.from === 'TPE' && row.to === 'BKK'))
      .toEqual([]);

    const flights = publishedFlightsOn(
      catalog,
      { from: 'TPE', to: 'BKK' },
      '2026-09-08',
      Date.parse('2026-09-07T19:24:00Z'),
    ).filter((flight) => flight.carrier === 'BR');
    expect(flights.map((flight) => `${flight.carrier}${flight.flightNumber}`)).toEqual([
      'BR75', 'BR67', 'BR211', 'BR205', 'BR61',
    ]);
    expect(flights.map((flight) => flight.flightNumber)).not.toContain('2217');
    expect(flights.map((flight) => [flight.flightNumber, flight.departureTime, flight.arrivalTime, flight.arrivalDate])).toEqual([
      ['75', '07:50', '10:50', '2026-09-08'],
      ['67', '08:15', '11:20', '2026-09-08'],
      ['211', '08:20', '11:10', '2026-09-08'],
      ['205', '20:45', '23:30', '2026-09-08'],
      ['61', '22:40', '01:20', '2026-09-09'],
    ]);
  });
  test('JAL 2026 North America schedule covers high-value RTW gateways with exact flight identities', () => {
    const now = Date.parse('2026-09-07T13:15:00Z');
    expect(publishedFlightsOn(catalog, { from: 'HND', to: 'SFO' }, '2026-09-07', now)
      .map((flight) => `${flight.carrier}${flight.flightNumber}`)).toContain('JL2');
    expect(publishedFlightsOn(catalog, { from: 'NRT', to: 'SEA' }, '2026-09-07', now)
      .map((flight) => `${flight.carrier}${flight.flightNumber}`)).toContain('JL68');
    expect(publishedFlightsOn(catalog, { from: 'LAX', to: 'NRT' }, '2026-09-07', now)
      .map((flight) => `${flight.carrier}${flight.flightNumber}`)).toContain('JL61');
  });
  test('Lufthansa references expose exact operating designators without importing partner-operated codeshares', () => {
    const sfoFra = catalog.flightNumberReferences.find((row) => row.id === 'lh-sfo-fra');
    const fraHnd = catalog.flightNumberReferences.find((row) => row.id === 'lh-fra-hnd');
    const fraSin = catalog.flightNumberReferences.find((row) => row.id === 'lh-fra-sin');
    expect(sfoFra?.flightNumbers).toEqual(['455']);
    expect(fraHnd?.flightNumbers).toEqual(['716']);
    expect(fraSin?.flightNumbers).toEqual(['780']);
    const allLh = catalog.flightNumberReferences
      .filter((row) => row.carrier === 'LH')
      .flatMap((row) => row.flightNumbers);
    expect(allLh).not.toContain('9410');
    expect(allLh).not.toContain('4948');
    expect(allLh).not.toContain('9762');
  });
  test('Asiana latest schedule covers every OZ route currently represented by the route-network catalog', () => {
    const routeNetwork = routeNetworkRaw as {
      routes: Array<{ carrier: string; pair: [string, string]; status: string }>;
    };
    const ozRoutes = routeNetwork.routes.filter((row) => row.carrier === 'OZ' && row.status === 'published');
    const covered = new Set(catalog.flightNumberReferences
      .filter((row) => row.carrier === 'OZ')
      .map((row) => `${row.from}->${row.to}`));
    expect(ozRoutes).toHaveLength(32);
    expect(ozRoutes.filter((row) => !covered.has(`${row.pair[0]}->${row.pair[1]}`))).toEqual([]);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'oz-tpe-icn')?.flightNumbers).toEqual(['712', '714']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'oz-icn-jfk')?.flightNumbers).toEqual(['222', '224']);
  });
  test('current high-value RTW references cover Finnair, Thai, Qatar and Qantas examples', () => {
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ay-hkg-hel-current')?.flightNumbers).toEqual(['100']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ay-hel-lhr-current')?.flightNumbers).toEqual(['1331', '1337']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'tg-bkk-ams-2026')?.flightNumbers).toEqual(['936']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qr-hnd-doh-2026')?.flightNumbers).toEqual(['813']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qr-hkg-doh-current')?.flightNumbers).toEqual(['815', '817']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qr-doh-hkg-current')?.flightNumbers).toEqual(['816']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qr-doh-hkg-818-current')?.flightNumbers).toEqual(['818']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qr-nrt-doh-current')?.flightNumbers).toEqual(['807']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qr-jfk-doh-current')?.flightNumbers).toEqual(['702', '704']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qr-lhr-doh-current')?.flightNumbers).toEqual(['004', '006', '008', '010', '016']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qf-syd-lax-current')?.flightNumbers).toEqual(['11']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qf-syd-jnb-current')?.flightNumbers).toEqual(['63']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qf-lax-syd-current')?.flightNumbers).toEqual(['12']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qf-hnd-syd-2026')?.flightNumbers).toEqual(['26']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qf-syd-sfo-current')?.flightNumbers).toEqual(['73']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qf-sfo-syd-current')?.flightNumbers).toEqual(['74']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qf-syd-sin-current')?.flightNumbers).toEqual(['1']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'qf-sin-syd-current')?.flightNumbers).toEqual(['2']);
  });
  test('Singapore trunk references cover the final KTI and MXP route-network gaps without inventing weekdays', () => {
    expect(catalog.flightNumberReferences.find((row) => row.id === 'sq-sin-kti-current')?.flightNumbers).toEqual(['156', '158']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'sq-sin-mxp-current')?.flightNumbers).toEqual(['356']);
  });
  test('Royal Jordanian September timetable exposes high-value RTW designators without special/codeshare rows', () => {
    expect(catalog.flightNumberReferences.find((row) => row.id === 'rj-amm-lhr-sep26')?.flightNumbers).toEqual(['111']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'rj-lhr-amm-sep26')?.flightNumbers).toEqual(['112']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'rj-amm-jfk-sep26')?.flightNumbers).toEqual(['261']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'rj-amm-doh-sep26')?.flightNumbers).toEqual(['650', '652', '654']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'rj-amm-vie-sep26')?.flightNumbers).toEqual(['159']);
    const rjNumbers = catalog.flightNumberReferences
      .filter((row) => row.carrier === 'RJ')
      .flatMap((row) => row.flightNumbers);
    expect(rjNumbers).toContain('182');
    expect(rjNumbers).not.toContain('5111');
    expect(rjNumbers).not.toContain('5112');
    expect(rjNumbers.every((number) => Number(number) < 5000)).toBe(true);
  });
  test('Royal Jordanian exact references remain selectable even when static route-network has not caught up', () => {
    const parsedNetwork = parseRouteNetworkCatalog(routeNetworkRaw, new Set(airports.map((airport) => airport.iata)));
    expect(parsedNetwork.routes.some((row) => row.carrier === 'RJ' && row.pair[0] === 'AMM' && row.pair[1] === 'IAD')).toBe(false);
    const index = buildNextLegIndex({
      network: parsedNetwork,
      schedules: [],
      officialSchedules: catalog,
      eligibleCarriers: new Set(['RJ']),
      referenceDate: '2026-09-07',
      evidenceNow: Date.parse('2026-09-07T15:06:00Z'),
      knownAirports: new Set(airports.map((airport) => airport.iata)),
    });
    expect(index.get('AMM')?.find((destination) => destination.iata === 'IAD')?.options[0]?.flightNumbers).toEqual(['RJ281']);
    expect(index.get('IAD')?.find((destination) => destination.iata === 'AMM')?.options[0]?.flightNumbers).toEqual(['RJ282']);
  });
  test('SWISS current flightplans cover every LX route represented by route-network without partner-operated codeshares', () => {
    const routeNetwork = routeNetworkRaw as {
      routes: Array<{ carrier: string; pair: [string, string]; status: string }>;
    };
    const lxRoutes = routeNetwork.routes.filter((row) => row.carrier === 'LX' && row.status === 'published');
    const refs = catalog.flightNumberReferences.filter((row) => row.carrier === 'LX');
    const covered = new Set(refs.map((row) => `${row.from}->${row.to}`));
    expect(lxRoutes).toHaveLength(18);
    expect(lxRoutes.filter((row) => !covered.has(`${row.pair[0]}->${row.pair[1]}`))).toEqual([]);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'lx-zrh-mia-current')?.flightNumbers).toEqual(['64']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'lx-zrh-bos-current')?.flightNumbers).toEqual(['52', '54']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'lx-gva-jfk-current')?.flightNumbers).toEqual(['22']);
    const allNumbers = refs.flatMap((row) => row.flightNumbers);
    for (const partnerOperated of ['3216', '3217', '9466', '9427', '9463', '9465']) {
      expect(allNumbers).not.toContain(partnerOperated);
    }
  });
  test('Air New Zealand and Malaysia Airlines current pages expose exact high-value RTW designators', () => {
    expect(catalog.flightNumberReferences.find((row) => row.id === 'nz-jfk-akl-current')).toMatchObject({
      carrier: 'NZ', from: 'JFK', to: 'AKL', flightNumbers: ['1'],
    });
    expect(catalog.flightNumberReferences.find((row) => row.id === 'nz-akl-jfk-current')).toMatchObject({
      carrier: 'NZ', from: 'AKL', to: 'JFK', flightNumbers: ['2'],
    });
    expect(catalog.flightNumberReferences.find((row) => row.id === 'mh-kul-nrt-current')?.flightNumbers).toEqual(['70', '88']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'mh-nrt-kul-current')?.flightNumbers).toEqual(['71', '89']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'mh-kul-kix-current')?.flightNumbers).toEqual(['52']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'mh-kix-kul-current')?.flightNumbers).toEqual(['53']);
    const nzNumbers = (from: string, to: string) => [...new Set(catalog.flightNumberReferences
      .filter((row) => row.carrier === 'NZ' && row.from === from && row.to === to)
      .flatMap((row) => row.flightNumbers))].sort();
    expect(nzNumbers('AKL', 'TPE')).toContain('77');
    expect(nzNumbers('TPE', 'AKL')).toContain('78');
    expect(nzNumbers('AKL', 'NRT')).toEqual(expect.arrayContaining(['95', '99']));
    expect(nzNumbers('NRT', 'AKL')).toContain('90');
    expect(nzNumbers('AKL', 'SIN')).toEqual(expect.arrayContaining(['282', '284']));
    expect(nzNumbers('SIN', 'AKL')).toEqual(expect.arrayContaining(['281', '283']));
    expect(nzNumbers('AKL', 'SFO')).toContain('8');
    expect(nzNumbers('SFO', 'AKL')).toContain('7');
    expect(nzNumbers('AKL', 'SYD')).toEqual(expect.arrayContaining(['101', '103', '111']));
    const mhNumbers = (from: string, to: string) => [...new Set(catalog.flightNumberReferences
      .filter((row) => row.carrier === 'MH' && row.from === from && row.to === to)
      .flatMap((row) => row.flightNumbers))].sort();
    expect(mhNumbers('KUL', 'LHR')).toEqual(expect.arrayContaining(['2', '04']));
    expect(mhNumbers('KUL', 'SYD')).toEqual(expect.arrayContaining(['141', '251']));
    expect(mhNumbers('KUL', 'HKG')).toEqual(expect.arrayContaining(['72', '78']));
    expect(mhNumbers('KUL', 'TPE')).toContain('366');
    expect(mhNumbers('KUL', 'BKK')).toContain('784');
    expect(mhNumbers('KUL', 'DOH')).toContain('164');
  });
  test('Air India current non-stop page exposes exact USA and UK trunk designators without inventing dates', () => {
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ai-del-jfk-current')?.flightNumbers).toEqual(['101']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ai-jfk-del-current')?.flightNumbers).toEqual(['102']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ai-del-sfo-current')?.flightNumbers).toEqual(['173']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ai-sfo-del-current')?.flightNumbers).toEqual(['174']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ai-bom-lhr-current')?.flightNumbers).toEqual(['129', '131']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ai-lhr-del-current')?.flightNumbers).toEqual(['162', '112']);
    const aiRefs = catalog.flightNumberReferences.filter((row) => row.carrier === 'AI');
    expect(aiRefs.length).toBeGreaterThanOrEqual(32);
    expect(new Set(aiRefs.flatMap((row) => row.flightNumbers)).size).toBeGreaterThanOrEqual(38);
    expect(aiRefs.every((row) => !('daysOfWeek' in row))).toBe(true);
  });
  test('Air India reference-only SFO-BLR remains selectable before static route-network catches up', () => {
    const parsedNetwork = parseRouteNetworkCatalog(routeNetworkRaw, new Set(airports.map((airport) => airport.iata)));
    expect(parsedNetwork.routes.some((row) => row.carrier === 'AI' && row.pair[0] === 'SFO' && row.pair[1] === 'BLR')).toBe(false);
    const index = buildNextLegIndex({
      network: parsedNetwork,
      schedules: [],
      officialSchedules: catalog,
      eligibleCarriers: new Set(['AI']),
      referenceDate: '2026-09-07',
      evidenceNow: Date.parse('2026-09-07T15:16:00Z'),
      knownAirports: new Set(airports.map((airport) => airport.iata)),
    });
    const option = index.get('SFO')?.find((destination) => destination.iata === 'BLR')?.options[0];
    expect(option?.flightNumbers).toEqual(['AI176']);
    expect(option?.scheduleStatus).toBe('unknown');
  });
  test('existing exact operator evidence closes small-carrier flight-number gaps without prefix inference', () => {
    expect(catalog.flightNumberReferences.find((row) => row.id === 'sn-bru-jfk-current')?.flightNumbers).toEqual(['501']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'sn-jfk-bru-current')?.flightNumbers).toEqual(['502']);
    const snNumbers = catalog.flightNumberReferences.filter((row) => row.carrier === 'SN').flatMap((row) => row.flightNumbers);
    expect(snNumbers).not.toContain('8807');
    expect(snNumbers).not.toContain('8808');

    expect(catalog.flightNumberReferences.find((row) => row.id === 'as-sfo-sea-20260905')?.flightNumbers).toEqual(['68']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'as-sea-sfo-20260905')?.flightNumbers).toEqual(['680']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'fj-nan-dfw-current')?.flightNumbers).toEqual(['890']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'fj-dfw-nan-current')?.flightNumbers).toEqual(['891']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'lo-waw-sfo-current')?.flightNumbers).toEqual(['35', '37']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'lo-sfo-waw-current')?.flightNumbers).toEqual(['36', '38']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ou-spu-fco-current')?.flightNumbers).toEqual(['380']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ou-dbv-fco-current')?.flightNumbers).toEqual(['384']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'ou-dbv-ath-current')?.flightNumbers).toEqual(['300']);

    // Alaska's HNL-HND status is AS831/AS832 operated by Hawaiian. The current
    // model cannot preserve a marketing designator separately from the
    // operating carrier, so it must not manufacture HA831/HA832.
    expect(catalog.flightNumberReferences.filter((row) => row.carrier === 'HA')).toEqual([]);
  });
  test('Thai current exact-number evidence covers every TG route represented by route-network', () => {
    const routeNetwork = routeNetworkRaw as {
      routes: Array<{ carrier: string; pair: [string, string]; status: string }>;
    };
    const tgRoutes = routeNetwork.routes.filter((row) => row.carrier === 'TG' && row.status === 'published');
    const covered = new Set(catalog.flightNumberReferences
      .filter((row) => row.carrier === 'TG')
      .map((row) => `${row.from}->${row.to}`));
    expect(tgRoutes).toHaveLength(14);
    expect(tgRoutes.filter((row) => !covered.has(`${row.pair[0]}->${row.pair[1]}`))).toEqual([]);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'tg-bkk-icn-current')?.flightNumbers).toEqual(['652']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'tg-bkk-kix-current')?.flightNumbers).toEqual(['622']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'tg-bkk-hkg-current')?.flightNumbers).toEqual(['600']);
    expect(catalog.flightNumberReferences.find((row) => row.id === 'tg-bkk-can-current')?.flightNumbers).toEqual(['668']);
  });
  test('Thai high-frequency hub routes preserve multiple exact current flight choices', () => {
    const numbers = (from: string, to: string) => [...new Set(catalog.flightNumberReferences
      .filter((row) => row.carrier === 'TG' && row.from === from && row.to === to)
      .flatMap((row) => row.flightNumbers))].sort();
    expect(numbers('TPE', 'BKK')).toEqual(expect.arrayContaining(['633', '635', '637']));
    expect(numbers('BKK', 'TPE')).toEqual(expect.arrayContaining(['632', '634', '636']));
    expect(numbers('BKK', 'SIN')).toEqual(expect.arrayContaining(['403', '413']));
    expect(numbers('SIN', 'BKK')).toEqual(expect.arrayContaining(['402', '404', '414']));
    expect(numbers('BKK', 'HKG')).toEqual(expect.arrayContaining(['600', '602']));
    expect(numbers('BKK', 'KIX')).toEqual(expect.arrayContaining(['622', '672']));
  });
  test('NH231 Monday is published, Tuesday is not in this partial publication', () => {
    expect(occurrence('2026-09-07').map((flight) => flight.flightNumber)).toEqual(['231']);
    expect(occurrence('2026-09-08')).toEqual([]);
  });
  test('missing times stay absent and date selection remains possible', () => {
    const flight = occurrence('2026-09-07')[0]!;
    expect(flight.departureTime).toBeUndefined(); expect(flight.arrivalDate).toBeUndefined();
    expect(selectedDepartureDate(flight)).toBe('2026-09-07');
  });
  test('no extrapolation past winter end', () => expect(occurrence('2027-03-29')).toEqual([]));
  test('two daily Taiwan flights preserve distinct flight numbers', () => {
    expect(publishedFlightsOn(catalog, { from: 'TSA', to: 'HND' }, '2026-11-02', NOW).map((flight) => flight.flightNumber)).toEqual(['852', '854']);
  });
  test('JAL HND-JFK preserves exact flight identity and published local-day offsets', () => {
    const outbound = publishedFlightsOn(catalog, { from: 'HND', to: 'JFK' }, '2026-09-07', Date.parse('2026-09-06T07:00:00Z'))
      .filter((flight) => flight.carrier === 'JL');
    expect(outbound.map((flight) => flight.flightNumber).sort()).toEqual(['4', '6']);
    expect(outbound.map((flight) => flight.arrivalDate)).toEqual(['2026-09-07', '2026-09-07']);

    const inbound = publishedFlightsOn(catalog, { from: 'JFK', to: 'HND' }, '2026-09-07', Date.parse('2026-09-06T07:00:00Z'))
      .filter((flight) => flight.carrier === 'JL');
    expect(inbound.map((flight) => flight.flightNumber).sort()).toEqual(['3', '5']);
    expect(inbound.map((flight) => flight.arrivalDate)).toEqual(['2026-09-08', '2026-09-08']);
  });
  test('Air Canada Summer 2026 publication preserves exact seasonal identity and weekdays', () => {
    const acNow = Date.parse('2026-09-06T08:00:00Z');
    const outbound = publishedFlightsOn(catalog, { from: 'YUL', to: 'CTA' }, '2026-09-08', acNow);
    expect(outbound.map((flight) => `${flight.carrier}${flight.flightNumber}`)).toContain('AC932');
    expect(outbound.find((flight) => flight.carrier === 'AC')?.arrivalDate).toBe('2026-09-09');
    expect(publishedFlightsOn(catalog, { from: 'YUL', to: 'CTA' }, '2026-09-09', acNow).filter((flight) => flight.carrier === 'AC')).toEqual([]);
  });
  test('officially excluded November 1 removes NH125', () => {
    const pair = { from: 'LAX', to: 'HND' };
    expect(publishedFlightsOn(catalog, pair, '2026-11-01', NOW)).toEqual([]);
    expect(publishedFlightsOn(catalog, pair, '2026-11-02', NOW)).toHaveLength(1);
  });
  test('exceptional Friday Vienna outbound is added only on the published date', () => {
    const pair = { from: 'HND', to: 'VIE' };
    expect(publishedFlightsOn(catalog, pair, '2026-10-23', NOW)).toHaveLength(1);
    expect(publishedFlightsOn(catalog, pair, '2026-10-16', NOW)).toEqual([]);
  });
  test('exceptional Saturday Vienna inbound is not borrowed from the outbound schedule', () => {
    const pair = { from: 'VIE', to: 'HND' };
    expect(publishedFlightsOn(catalog, pair, '2026-10-24', NOW)).toHaveLength(1);
    expect(publishedFlightsOn(catalog, pair, '2026-10-17', NOW)).toEqual([]);
  });
  test('sources past review deadline cannot assert future published positives', () => {
    expect(publishedFlightsOn(catalog, query, '2026-11-02', Date.parse('2026-10-06T00:00:00Z'))).toEqual([]);
  });
  test('sources verified in the future are rejected', () => expect(publishedFlightsOn(catalog, query, '2026-09-07', NOW - 86400000)).toEqual([]));
  test('calendar distinguishes published from live and cannot infer no-service', () => {
    const result = FlightQueryResponseSchema.parse(queryOfficialSchedules(catalog, query, NOW));
    expect(flightDayView(result.days[0], NH, NOW).status).toBe('published');
    expect(flightDayView(result.days[1], NH, NOW).status).toBe('unknown');
    expect(flightDayView(result.days[0], new Set(['CX']), NOW).status).toBe('unknown');
    expect(result.days.every((day) => !day.complete && day.flights.length === 0)).toBe(true);
  });
  test('reopening a query does not refresh the airline verification timestamp', () => {
    const first = queryOfficialSchedules(catalog, query, NOW).days[0]!.published![0]!;
    const second = queryOfficialSchedules(catalog, query, NOW + 86400000).days[0]!.published![0]!;
    expect(second.source.checkedAt).toBe(first.source.checkedAt);
  });
  test('a complete fresh route query outranks partial publications, including empty results', () => {
    const fallback = queryOfficialSchedules(catalog, query, NOW);
    const primary = { ...fallback, days: fallback.days.map((day) => ({ date: day.date, checkedAt: day.checkedAt, expiresAt: day.expiresAt, flights: [], complete: true })) };
    const result = mergeOfficialSchedules(primary, fallback, NOW);
    expect(flightDayView(result.days[0], NH, NOW).status).toBe('none');
    expect(result.days[0]?.published).toBeUndefined();
  });
  test('a failed gateway does not suppress usable official publication dates', () => {
    const fallback = queryOfficialSchedules(catalog, query, NOW);
    const failed = { ...fallback, days: fallback.days.map((day) => ({ date: day.date, checkedAt: day.checkedAt, expiresAt: day.expiresAt, flights: [], complete: false, issue: 'provider-error' as const })) };
    expect(flightDayView(mergeOfficialSchedules(failed, fallback, NOW).days[0], NH, NOW).status).toBe('published');
  });
  test('merging refuses different directional queries', () => {
    const a = queryOfficialSchedules(catalog, query, NOW);
    const b = queryOfficialSchedules(catalog, { ...query, from: 'BRU', to: 'NRT' }, NOW);
    expect(() => mergeOfficialSchedules(a, b, NOW)).toThrow();
  });
  test('fresh primary timetable details are not overwritten by a date-only fallback', () => {
    const fallback = queryOfficialSchedules(catalog, query, NOW);
    const primary = { ...fallback, days: fallback.days.map((day) => ({ ...day, published: day.published?.map((flight) => ({ ...flight, departureTime: '10:20' })) })) };
    expect(mergeOfficialSchedules(primary, fallback, NOW).days[0]?.published?.[0]?.departureTime).toBe('10:20');
  });
  test('schema rejects impossible/contradictory dates and missing provenance', () => {
    for (const change of [{ effectiveUntil: '2026-02-30' }, { addedDates: ['2026-09-07'], removedDates: ['2026-09-07'] }, { sourceId: 'missing' }, { daysOfWeek: [1, 1] }]) {
      expect(OfficialScheduleCatalogSchema.safeParse({ ...raw, services: [{ ...raw.services[0], ...change }] }).success).toBe(false);
    }
  });
  test('conflicting clock times for one flight are withheld, not selected by file order', () => {
    const row = catalog.services.find((service) => service.id === 'nh231-s26')!;
    const conflicting = { ...catalog, services: [{ ...row, departureTime: '10:00' }, { ...row, id: 'conflict', departureTime: '11:00' }] };
    expect(publishedFlightsOn(conflicting, query, '2026-09-07', NOW)).toEqual([]);
  });
  test('local cross-day offsets are applied only when explicit', () => {
    const row = { ...catalog.services[0]!, from: 'HND', to: 'TSA', departureTime: '23:30', arrivalTime: '01:00', arrivalDayOffset: 1 };
    const flight = publishedFlightsOn({ ...catalog, services: [row] }, row, '2026-09-07', NOW)[0]!;
    expect(flight.arrivalDate).toBe('2026-09-08'); expect(PublishedFlightSchema.safeParse(flight).success).toBe(true);
  });
  test('official directional routes appear without fabricating legacy weekdays', () => {
    const network = withOfficialRoutes(null, catalog, '2026-09-07');
    expect(parseRouteNetworkCatalog(network, new Set(airports.map((airport) => airport.iata))).routes.length).toBeGreaterThan(0);
    expect(network.routes.some((row) => row.pair.join('-') === 'TSA-HND')).toBe(true);
    expect(JSON.stringify(network)).not.toContain('daysOfWeek');
    expect(withOfficialRoutes(null, catalog, '2027-04-01').routes).toEqual([]);
  });
});
