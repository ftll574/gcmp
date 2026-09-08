export interface AllianceAffiliateOperator {
  readonly brand: string;
  readonly operatorIcao: string;
  readonly operatorName: string;
  readonly sourceUrl: string;
  readonly sourceNote: string;
}

/**
 * Current branded/regional operators that can legitimately place a member
 * airline's designator/brand on a passenger route, but whose aircraft are
 * operated under a different ICAO callsign. These rows are intentionally used
 * only to create `provider-listed` discovery routes; they never prove that the
 * alliance member itself operates the aircraft.
 */
export const allianceAffiliateOperators: ReadonlyArray<AllianceAffiliateOperator> = [
  { brand: 'BA', operatorIcao: 'CFE', operatorName: 'BA CityFlyer',
    sourceUrl: 'https://www.britishairways.com/content/information/partners-and-alliances',
    sourceNote: 'British Airways identifies BA CityFlyer as a wholly-owned subsidiary operating UK domestic and European services from London City.' },
  { brand: 'BA', operatorIcao: 'EFW', operatorName: 'BA Euroflyer',
    sourceUrl: 'https://www.britishairways.com/content/information/partners-and-alliances',
    sourceNote: 'British Airways identifies BA Euroflyer as a wholly-owned subsidiary operating services from London Gatwick.' },
  { brand: 'IB', operatorIcao: 'IBS', operatorName: 'Iberia Express',
    sourceUrl: 'https://grupo.iberia.com/about_us/our_activities',
    sourceNote: 'Iberia states that Iberia, Iberia Express and Iberia Regional Air Nostrum jointly fly the Iberia network from Madrid.' },
  { brand: 'IB', operatorIcao: 'ANE', operatorName: 'Iberia Regional Air Nostrum',
    sourceUrl: 'https://www.iberia.com/cr/en/iberia-regional-air-nostrum/',
    sourceNote: 'Iberia publishes dedicated guidance for flights operated by Iberia Regional Air Nostrum and applies Iberia baggage conditions.' },
  { brand: 'QF', operatorIcao: 'QLK', operatorName: 'QantasLink',
    sourceUrl: 'https://www.qantas.com/zh-tw/book/flights/conditions-of-carriage',
    sourceNote: 'Qantas conditions apply to QF-designated Australian flights operated by National Jet Systems, Sunstate or Eastern Australia; current QantasLink operations use the QLK callsign for these services.' },
  { brand: 'QF', operatorIcao: 'NWK', operatorName: 'Network Aviation',
    sourceUrl: 'https://www.qantas.com/zh-tw/book/flights/conditions-of-carriage',
    sourceNote: 'Qantas conditions explicitly include QF-designated Australian flights operated by Network Aviation.' },
  { brand: 'QF', operatorIcao: 'UTY', operatorName: 'Alliance Airlines',
    sourceUrl: 'https://www.qantas.com/zh-tw/book/flights/conditions-of-carriage',
    sourceNote: 'Qantas conditions explicitly include QF-designated Australian flights operated by Alliance Airlines.' },
  { brand: 'AC', operatorIcao: 'JZA', operatorName: 'Jazz Aviation',
    sourceUrl: 'https://www.aircanada.com/ca/en/aco/home/about/corporate-profile.html',
    sourceNote: 'Air Canada says Jazz Aviation operates flights on its behalf under the Air Canada Express brand.' },
  { brand: 'AC', operatorIcao: 'PVL', operatorName: 'PAL Airlines',
    sourceUrl: 'https://www.aircanada.com/media/air-canada-intends-to-extend-and-expand-commercial-agreement-with-pal-airlines/',
    sourceNote: 'Air Canada states PAL Airlines operates regional flights for Air Canada Express under a commercial agreement.' },
  { brand: 'AC', operatorIcao: 'ROU', operatorName: 'Air Canada Rouge',
    sourceUrl: 'https://www.aircanada.com/ca/en/aco/home/fly/onboard/fleet.html',
    sourceNote: 'Air Canada lists Air Canada Rouge as its branded operating fleet alongside Air Canada and Air Canada Express.' },
  { brand: 'MU', operatorIcao: 'CSH', operatorName: 'Shanghai Airlines',
    sourceUrl: 'https://www.ceairgroup.com/ceairgroup/xwzx_158/dhxw_159/202606/t20260623_30058.html',
    sourceNote: 'China Eastern Group current publications explicitly describe China Eastern operations as including its Shanghai Airlines subsidiary.' },
  { brand: 'VN', operatorIcao: 'VFC', operatorName: 'VASCO',
    sourceUrl: 'https://www.vietnamairlines.com/us/en/vietnam-airlines/subsidiaries-partners/other-partners',
    sourceNote: 'Vietnam Airlines publishes VASCO-operated codeshare routes in its partner network.' },
  { brand: 'VN', operatorIcao: 'PIC', operatorName: 'Pacific Airlines',
    sourceUrl: 'https://www.vietnamairlines.com/au/en/vietnam-airlines/subsidiaries-partners/other-partners',
    sourceNote: 'Vietnam Airlines publishes Pacific Airlines codeshare routes and identifies Pacific Airlines within the Vietnam Airlines Group ecosystem.' },
  { brand: 'AF', operatorIcao: 'HOP', operatorName: 'Air France HOP',
    sourceUrl: 'https://corporate.airfrance.com/en/press-releases/air-france-inaugurates-new-cabin-its-embraer-190',
    sourceNote: 'Air France describes HOP! as its regional subsidiary and identifies current AF flights operated by HOP!.' },
  { brand: 'KL', operatorIcao: 'KLC', operatorName: 'KLM Cityhopper',
    sourceUrl: 'https://www.klm.com/information/corporate/history',
    sourceNote: 'KLM identifies KLM Cityhopper as its feeder subsidiary for European services.' },
  { brand: 'FJ', operatorIcao: 'FJA', operatorName: 'Fiji Link',
    sourceUrl: 'https://www.fijiairways.com/media/246988/fiji-airways-terms-and-conditions-of-carriage.pdf',
    sourceNote: 'Fiji Airways conditions define Fiji Link as Fiji Airlines Limited trading as Fiji Link and apply the FJ designator across the airline contract.' },
  { brand: 'AM', operatorIcao: 'SLI', operatorName: 'Aeromexico Connect',
    sourceUrl: 'https://www.sec.gov/Archives/edgar/data/1561861/000119312526197494/d101275d20f.htm',
    sourceNote: 'Grupo Aeromexico 2026 filing identifies Aeromexico Connect (Aerolitoral) as its operating subsidiary and regional network arm.' },
];

const seen = new Set<string>();
for (const row of allianceAffiliateOperators) {
  if (!/^[A-Z0-9]{2,3}$/.test(row.brand) || !/^[A-Z]{3}$/.test(row.operatorIcao)) throw new Error('Invalid affiliate airline code');
  const key = `${row.brand}:${row.operatorIcao}`;
  if (seen.has(key)) throw new Error(`Duplicate affiliate mapping ${key}`);
  seen.add(key);
}
