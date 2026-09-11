# Official Airline Schedule Engine — 2026-09-12

GCMP should prefer airline-owned route and schedule evidence before third-party timetable sites. The long-term collection order is:

1. airline official timetable, booking, flight-search or flight-status APIs;
2. airport / civil-aviation official sources;
3. ADS-B observations;
4. government datasets;
5. schedule aggregators for discovery and corroboration.

The implementation unit is an **engine family adapter**, with carrier-specific overrides only where necessary. A CDN/WAF is not a booking engine: the fingerprint model records `protection` separately from `engineFamily`.

## Fingerprint scanner

Run the research scanner directly while `package.json` is owned by another work package:

```bash
npx tsx scripts/research-official-carrier-engines.ts --refresh --carriers=MU,TK,AF,SN,FJ,IB,CA
```

The default report and bounded HTML cache stay outside the repository under:

```text
E:/workspace/.gcmp-route-work/official-carrier-engines/
```

The scanner reads the 60 active alliance members from `public/data/alliances/current.json`, validates committed official-source seeds, follows redirects, records selected response headers, extracts script hosts and likely booking/API endpoints, and fingerprints both the site protection layer and likely engine family.

## First seven-carrier scan

The 2026-09-12 reconnaissance produced these useful groups:

| Carrier | Observed site result | Engine/group direction | Protection |
| --- | --- | --- | --- |
| MU | 200, large first-party HTML; `ceair.com` + Alibaba CDN scripts | custom China Eastern stack | none observed |
| TK | 200, small shell behind Envoy | custom Turkish stack | Akamai |
| AF | 200 Air France splash; exposes `shopping.airfrance.com` | Air France–KLM family | Akamai |
| SN | 403 for homepage and booking entry | Lufthansa Group is an organization-level hint; engine still unobserved | Cloudflare |
| FJ | locale redirect returns 404 shell; AirTRFX frontend assets visible | engine still unknown | Akamai |
| IB | 200; exposes Iberia service/API domains and searcher bundle | IAG family | Akamai |
| CA | 200; first-party `airchina.com.cn` / `webresource.airchina.com.cn` stack | custom Air China stack | none observed |

`groupHint` is deliberately separate from observed engine evidence. For example, Brussels Airlines is a Lufthansa Group carrier, but a Cloudflare 403 means the current HTTP scan has not yet proven which booking backend its page invokes.

## Adapter priorities

The next adapter work should exploit the highest-reuse families first instead of writing 60 unrelated crawlers:

1. Air France–KLM family (`AF`, then `KL` and related reuse checks);
2. Lufthansa Group (`SN`, `LH`, `LX`, `OS`) using browser/network capture when plain HTTP is blocked;
3. IAG (`IB`, then BA reuse checks);
4. custom high-gap carriers (`MU`, `TK`, `CA`);
5. Fiji Airways after locating the booking endpoint behind the AirTRFX/content shell.

Official booking responses may expose marketing carrier, operating carrier, flight number, dates, weekdays and local times. GCMP must preserve those fields separately and must never promote a marketing carrier to physical operator merely because an official route is bookable.

## Air France–KLM official Offers adapter

The first family adapter uses the Air France–KLM Open Data Offers API rather than scraping the consumer booking UI:

```text
POST https://api.airfranceklm.com/opendata/offers/v1/available-offers
```

The adapter reads `AFKL_API_KEY` only on the server/research side and sends it in the documented `api-key` header. The normalized record deliberately keeps these identities separate:

- marketing carrier;
- marketing flight number;
- operating carrier;
- origin / destination;
- local departure / arrival timestamps;
- equipment type when published.

Connecting itineraries are not converted into nonstop route evidence. Duplicate fare offers for the same physical segment collapse to one schedule record, and malformed direct rows make the result partial instead of being guessed.

Local live validation is currently credential-blocked: `AFKL_API_KEY` is not configured and an unauthenticated Open Data request returns HTTP 403 (`Developer Inactive`). The research CLI therefore fails before network access when the key is absent. Parser, request builder, credential isolation and mocked official responses are test-covered; no live AF/KL schedule has been claimed yet.
