import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { distanceNm } from '../src/lib/calc/haversine.ts';
import { LandingShowcaseCatalogSchema } from '../src/lib/schemas/landing-showcase.ts';
import { AllianceCatalogSchema } from '../src/lib/schemas/alliance.ts';
import { parseAirportCatalog } from '../src/lib/schemas/airports.ts';
import { parseRouteNetworkCatalog } from '../src/lib/schemas/route-network.ts';
import type { Airline } from '../src/lib/types.ts';

const ROOT = resolve(import.meta.dirname, '..');
const OUTPUT = resolve(ROOT, 'public', 'data', 'site', 'landing-showcases.json');

interface ShowcasePlan {
  readonly id: string;
  readonly alliance: 'star' | 'oneworld' | 'skyteam' | 'mixed';
  readonly titleZh: string;
  readonly titleEn: string;
  readonly eyebrowZh: string;
  readonly eyebrowEn: string;
  readonly descriptionZh: string;
  readonly descriptionEn: string;
  readonly legs: ReadonlyArray<{
    readonly from: string;
    readonly to: string;
    readonly carrier: string;
    readonly flightNumber: string;
  }>;
}

const SHOWCASES: ReadonlyArray<ShowcasePlan> = [
  {
    id: 'star-world-loop',
    alliance: 'star',
    titleZh: 'Star Alliance 經典環球',
    titleEn: 'Classic Star Alliance RTW',
    eyebrowZh: '跨太平洋 · 北美 · 歐洲 · 亞洲',
    eyebrowEn: 'Pacific · North America · Europe · Asia',
    descriptionZh: '從台灣一路向東，利用 ANA、United、Lufthansa、Singapore Airlines 與 EVA Air 串出一條可讀的聯盟環球骨架。',
    descriptionEn: 'A readable eastbound alliance skeleton from Taiwan through ANA, United, Lufthansa, Singapore Airlines and EVA Air.',
    legs: [
      { from: 'TPE', to: 'NRT', carrier: 'BR', flightNumber: 'BR184' },
      { from: 'NRT', to: 'LAX', carrier: 'NH', flightNumber: 'NH6' },
      { from: 'LAX', to: 'SFO', carrier: 'UA', flightNumber: 'UA1195' },
      { from: 'SFO', to: 'EWR', carrier: 'UA', flightNumber: 'UA1141' },
      { from: 'EWR', to: 'FRA', carrier: 'LH', flightNumber: 'LH403' },
      { from: 'FRA', to: 'IST', carrier: 'LH', flightNumber: 'LH1298' },
      { from: 'IST', to: 'SIN', carrier: 'SQ', flightNumber: 'SQ391' },
      { from: 'SIN', to: 'TPE', carrier: 'BR', flightNumber: 'BR216' },
    ],
  },
  {
    id: 'oneworld-world-loop',
    alliance: 'oneworld',
    titleZh: 'oneworld 城市樞紐環球',
    titleEn: 'oneworld hub-to-hub RTW',
    eyebrowZh: '香港 · 倫敦 · 紐約 · 洛杉磯 · 東京',
    eyebrowEn: 'Hong Kong · London · New York · Los Angeles · Tokyo',
    descriptionZh: '以 Cathay Pacific、British Airways、American Airlines 與 Japan Airlines 串接五個大型樞紐，展示 oneworld 很典型的環球節奏。',
    descriptionEn: 'Cathay Pacific, British Airways, American Airlines and Japan Airlines connect five major hubs in a classic oneworld rhythm.',
    legs: [
      { from: 'TPE', to: 'HKG', carrier: 'CX', flightNumber: 'CX407' },
      { from: 'HKG', to: 'LHR', carrier: 'CX', flightNumber: 'CX237' },
      { from: 'LHR', to: 'JFK', carrier: 'BA', flightNumber: 'BA181' },
      { from: 'JFK', to: 'LAX', carrier: 'AA', flightNumber: 'AA1' },
      { from: 'LAX', to: 'NRT', carrier: 'JL', flightNumber: 'JL61' },
      { from: 'NRT', to: 'TPE', carrier: 'JL', flightNumber: 'JL809' },
    ],
  },
  {
    id: 'skyteam-world-loop',
    alliance: 'skyteam',
    titleZh: 'SkyTeam 跨洲接力',
    titleEn: 'SkyTeam intercontinental relay',
    eyebrowZh: '首爾 · 洛杉磯 · 亞特蘭大 · 巴黎 · 河內',
    eyebrowEn: 'Seoul · Los Angeles · Atlanta · Paris · Hanoi',
    descriptionZh: 'Korean Air、Delta、Air France 與 Vietnam Airlines 把亞洲、北美與歐洲接成一圈，適合快速理解 SkyTeam 的長程骨幹。',
    descriptionEn: 'Korean Air, Delta, Air France and Vietnam Airlines connect Asia, North America and Europe into a compact SkyTeam long-haul loop.',
    legs: [
      { from: 'TPE', to: 'ICN', carrier: 'KE', flightNumber: 'KE2022' },
      { from: 'ICN', to: 'LAX', carrier: 'KE', flightNumber: 'KE207' },
      { from: 'LAX', to: 'ATL', carrier: 'DL', flightNumber: 'DL320' },
      { from: 'ATL', to: 'CDG', carrier: 'DL', flightNumber: 'DL100' },
      { from: 'CDG', to: 'HAN', carrier: 'VN', flightNumber: 'VN18' },
      { from: 'HAN', to: 'TPE', carrier: 'VN', flightNumber: 'VN578' },
    ],
  },
  {
    id: 'taiwan-longhaul',
    alliance: 'mixed',
    titleZh: '台灣出發長程四段',
    titleEn: 'Four long-haul legs from Taiwan',
    eyebrowZh: '舊金山 · 紐約 · 巴黎 · 台北',
    eyebrowEn: 'San Francisco · New York · Paris · Taipei',
    descriptionZh: '不限定單一聯盟，只用目前資料庫中的已確認班號示範：台灣如何用四個長程航段快速看懂跨太平洋與跨大西洋。',
    descriptionEn: 'A mixed-alliance view using confirmed designators from the current catalog to make the Pacific and Atlantic structure instantly legible.',
    legs: [
      { from: 'TPE', to: 'SFO', carrier: 'BR', flightNumber: 'BR8' },
      { from: 'SFO', to: 'JFK', carrier: 'AA', flightNumber: 'AA16' },
      { from: 'JFK', to: 'CDG', carrier: 'AA', flightNumber: 'AA42' },
      { from: 'CDG', to: 'TPE', carrier: 'BR', flightNumber: 'BR88' },
    ],
  },
];

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as unknown;
}

function main(): void {
  const airports = parseAirportCatalog(readJson('public/data/airports.json'));
  const airportByIata = new Map(airports.map((airport) => [airport.iata, airport] as const));
  const airlines = readJson('public/data/airlines.json') as ReadonlyArray<Airline>;
  const airlineByIata = new Map(airlines.map((airline) => [airline.iata, airline] as const));
  const allianceCatalog = AllianceCatalogSchema.parse(readJson('public/data/alliances/current.json'));
  const allianceNameByIata = new Map(
    allianceCatalog.memberships.map((membership) => [membership.airline, membership.airlineName] as const),
  );
  const runtime = parseRouteNetworkCatalog(
    readJson('public/data/route-network/runtime-current.json'),
    new Set(airportByIata.keys()),
  );
  const runtimeMeta = readJson('public/data/route-network/runtime-current.meta.json') as {
    publishedRoutes?: unknown;
    builtOn?: unknown;
  };

  const usedAirportCodes = new Set<string>();
  const showcases = SHOWCASES.map((plan) => ({
    ...plan,
    legs: plan.legs.map((plannedLeg) => {
      const route = runtime.routes.find((candidate) =>
        candidate.status === 'published' &&
        candidate.carrier === plannedLeg.carrier &&
        candidate.pair[0] === plannedLeg.from &&
        candidate.pair[1] === plannedLeg.to,
      );
      if (!route) throw new Error(`Landing showcase route missing: ${plannedLeg.carrier} ${plannedLeg.from}-${plannedLeg.to}`);
      if (route.carrierIdentity === 'provider-listed') {
        throw new Error(`Landing showcase requires confirmed operating identity: ${plannedLeg.carrier} ${plannedLeg.from}-${plannedLeg.to}`);
      }
      if (!route.flightNumbers?.includes(plannedLeg.flightNumber)) {
        throw new Error(`Landing flight number is no longer confirmed: ${plannedLeg.flightNumber} ${plannedLeg.from}-${plannedLeg.to}`);
      }
      const from = airportByIata.get(plannedLeg.from);
      const to = airportByIata.get(plannedLeg.to);
      const airline = airlineByIata.get(plannedLeg.carrier);
      const carrierName = airline?.name ?? allianceNameByIata.get(plannedLeg.carrier);
      if (!from || !to || !carrierName) throw new Error(`Landing showcase lookup failed for ${plannedLeg.carrier} ${plannedLeg.from}-${plannedLeg.to}`);
      usedAirportCodes.add(from.iata);
      usedAirportCodes.add(to.iata);
      return {
        ...plannedLeg,
        carrierName,
        distanceNm: Math.round(distanceNm(from, to)),
      };
    }),
  }));

  const publishedRoutes = runtimeMeta.publishedRoutes;
  if (!Number.isInteger(publishedRoutes) || (publishedRoutes as number) <= 0) {
    throw new Error('runtime-current.meta.json is missing publishedRoutes');
  }
  const builtOn = runtimeMeta.builtOn;
  if (typeof builtOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(builtOn)) {
    throw new Error('runtime-current.meta.json is missing builtOn');
  }

  const catalog = LandingShowcaseCatalogSchema.parse({
    version: 1,
    builtOn,
    routeNetworkVersion: runtime.version,
    stats: {
      publishedRoutes,
      allianceMembers: allianceCatalog.memberships.filter((membership) => membership.status === 'member').length,
      alliances: 3,
    },
    airports: [...usedAirportCodes]
      .sort()
      .map((iata) => airportByIata.get(iata)!)
      .map(({ iata, name, city, country, lat, lon }) => ({ iata, name, city, country, lat, lon })),
    showcases,
  });

  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(catalog, null, 2)}\n`);
  console.log(JSON.stringify({
    output: OUTPUT,
    bytes: Buffer.byteLength(JSON.stringify(catalog)),
    airports: catalog.airports.length,
    showcases: catalog.showcases.length,
    legs: catalog.showcases.reduce((sum, showcase) => sum + showcase.legs.length, 0),
  }, null, 2));
}

main();
