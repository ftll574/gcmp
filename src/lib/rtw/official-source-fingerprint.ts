export type OfficialEngineFamily =
  | 'lufthansa-group'
  | 'air-france-klm'
  | 'iag'
  | 'amadeus'
  | 'sabre'
  | 'navitaire'
  | 'custom'
  | 'unknown';

export type OfficialProtection = 'akamai' | 'imperva' | 'cloudflare' | 'none' | 'unknown';

export interface OfficialSourceProbe {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  headers: Readonly<Record<string, string>>;
  html: string;
}

export interface OfficialSourceFingerprint {
  engineFamily: OfficialEngineFamily;
  protection: OfficialProtection;
  confidence: 'low' | 'medium' | 'high';
  markers: string[];
  scriptHosts: string[];
  endpointCandidates: string[];
}

function sourceText(probe: OfficialSourceProbe): string {
  return [
    probe.requestedUrl,
    probe.finalUrl,
    ...Object.entries(probe.headers).flatMap(([key, value]) => [key, value]),
    probe.html,
  ].join('\n').toLowerCase();
}

export function extractScriptHosts(html: string, baseUrl: string): string[] {
  const hosts = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    const source = match[1];
    if (!source) continue;
    try {
      hosts.add(new URL(source, baseUrl).hostname.toLowerCase());
    } catch {
      // Ignore malformed or non-URL script references; they are not useful fingerprints.
    }
  }
  return [...hosts].sort();
}

export function extractEndpointCandidates(html: string, baseUrl: string): string[] {
  const candidates = new Set<string>();
  const values: string[] = [];
  for (const match of html.matchAll(/<(?:form|script)\b[^>]*(?:action|src)=["']([^"']+)["']/gi)) {
    const value = match[1];
    if (value) values.push(value);
  }
  const normalizedHtml = html.replaceAll('\\/', '/');
  for (const match of normalizedHtml.matchAll(/https?:\/\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]+/g)) values.push(match[0]);
  for (const value of values) {
    try {
      const url = new URL(value, baseUrl);
      const searchable = `${url.hostname}${url.pathname}${url.search}`.toLowerCase();
      if (!/(book|booking|flight|schedule|search|availability|api|graphql|shopping|offer)/.test(searchable)) continue;
      if (/\.(?:png|jpe?g|gif|svg|webp|ico|css|woff2?|ttf|map)(?:$|\?)/.test(url.pathname.toLowerCase())) continue;
      url.hash = '';
      candidates.add(url.toString());
      if (candidates.size >= 40) break;
    } catch {
      // Ignore malformed embedded values.
    }
  }
  return [...candidates].sort();
}

function includesAny(text: string, markers: readonly string[]): string[] {
  return markers.filter((marker) => text.includes(marker));
}

export function fingerprintOfficialSource(probe: OfficialSourceProbe): OfficialSourceFingerprint {
  const text = sourceText(probe);
  const scriptHosts = extractScriptHosts(probe.html, probe.finalUrl || probe.requestedUrl);
  const endpointCandidates = extractEndpointCandidates(probe.html, probe.finalUrl || probe.requestedUrl);
  const markerText = `${text}\n${scriptHosts.join('\n')}`;
  const markers: string[] = [];

  let protection: OfficialProtection = 'none';
  const akamai = includesAny(markerText, ['akamai', 'akamai-grn', '_abck', 'bm_sz', 'reference #']);
  const imperva = includesAny(markerText, ['incapsula', 'imperva', 'visid_incap', 'incap_ses']);
  const cloudflare = includesAny(markerText, ['cf-ray', 'cloudflare', '__cf_bm']);
  if (imperva.length) { protection = 'imperva'; markers.push(...imperva.map((x) => `protection:${x}`)); }
  else if (akamai.length) { protection = 'akamai'; markers.push(...akamai.map((x) => `protection:${x}`)); }
  else if (cloudflare.length) { protection = 'cloudflare'; markers.push(...cloudflare.map((x) => `protection:${x}`)); }

  const engineRules: Array<{ family: OfficialEngineFamily; terms: string[] }> = [
    { family: 'lufthansa-group', terms: ['lufthansa group', 'lufthansa.com', 'travel id', 'lh.com'] },
    { family: 'air-france-klm', terms: ['airfrance', 'air france', 'klm.com', 'air france-klm'] },
    { family: 'iag', terms: ['iberia.com', 'britishairways.com', 'iag.cloud', 'iag booking'] },
    { family: 'navitaire', terms: ['navitaire', 'newskies'] },
    { family: 'sabre', terms: ['sabre', 'sabre sonic', 'sabresonic'] },
    { family: 'amadeus', terms: ['amadeus', 'amadeus digital', 'altéa', 'altea'] },
  ];

  for (const rule of engineRules) {
    const hits = includesAny(markerText, rule.terms);
    if (hits.length) {
      markers.push(...hits.map((x) => `engine:${x}`));
      return {
        engineFamily: rule.family,
        protection,
        confidence: hits.length >= 2 ? 'high' : 'medium',
        markers: [...new Set(markers)],
        scriptHosts,
        endpointCandidates,
      };
    }
  }

  const hasUsefulHtml = probe.status >= 200 && probe.status < 400 && probe.html.trim().length >= 500;
  return {
    engineFamily: hasUsefulHtml ? 'custom' : 'unknown',
    protection: probe.status === 0 && protection === 'none' ? 'unknown' : protection,
    confidence: hasUsefulHtml ? 'low' : 'low',
    markers: [...new Set(markers)],
    scriptHosts,
    endpointCandidates,
  };
}
