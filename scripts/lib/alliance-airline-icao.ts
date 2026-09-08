import airlinesRaw from '../../public/data/airlines.json' with { type: 'json' };
import alliancesRaw from '../../public/data/alliances/current.json' with { type: 'json' };
import { AllianceCatalogSchema } from '../../src/lib/schemas/alliance.ts';

const OVERRIDES: Readonly<Record<string, string>> = {
  A3: 'AEE', AI: 'AIC', AR: 'ARG', AT: 'RAM', AZ: 'ITY', CA: 'CCA',
  CM: 'CMP', FJ: 'FJI', KQ: 'KQA', LO: 'LOT', ME: 'MEA', MF: 'CXA',
  OU: 'CTN', RJ: 'RJA', RO: 'ROT', SA: 'SAA', SN: 'BEL', SV: 'SVA',
  TP: 'TAP', UX: 'AEA', VN: 'HVN', WY: 'OMA', ZH: 'CSZ',
};

export interface AllianceAirlineCode {
  readonly iata: string;
  readonly icao: string;
  readonly alliance: 'oneworld' | 'star' | 'skyteam';
}

export function activeAllianceAirlineCodes(asOf = '2026-09-08'): AllianceAirlineCode[] {
  const alliances = AllianceCatalogSchema.parse(alliancesRaw);
  const byIata = new Map(airlinesRaw.map((airline) => [airline.iata, airline] as const));
  const result = alliances.memberships
    .filter((membership) => membership.status === 'member'
      && (!membership.effectiveFrom || membership.effectiveFrom <= asOf)
      && (!membership.effectiveTo || membership.effectiveTo >= asOf))
    .map((membership) => {
      const icao = byIata.get(membership.airline)?.icao ?? OVERRIDES[membership.airline];
      if (!icao || !/^[A-Z]{3}$/.test(icao)) throw new Error(`Missing current ICAO code for ${membership.airline}`);
      return { iata: membership.airline, icao, alliance: membership.alliance };
    });
  const seenIata = new Set<string>();
  const seenIcao = new Set<string>();
  for (const row of result) {
    if (seenIata.has(row.iata)) throw new Error(`Duplicate active alliance airline ${row.iata}`);
    // Distinct alliance members sharing an ICAO code would make callsign
    // attribution ambiguous; fail instead of guessing.
    if (seenIcao.has(row.icao)) throw new Error(`Ambiguous active alliance ICAO code ${row.icao}`);
    seenIata.add(row.iata); seenIcao.add(row.icao);
  }
  if (result.length !== 60) throw new Error(`Expected 60 active alliance airlines, got ${result.length}`);
  return result.sort((a, b) => a.iata.localeCompare(b.iata));
}
