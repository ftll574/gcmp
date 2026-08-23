# Decision: `continentsVisited` — country→continent mapping strategy

- **Status:** proposed (researcher → captain/engineer review)
- **Date:** 2026-05-24
- **Scope:** adds `continentsVisited` to `RtwValidationSummary`; specifies data file, schema, engine wiring, tests. Does **not** implement anything.
- **Inputs consulted:** `docs/rtw-pivot-plan.md` (summary shape, lines 255–270), `src/lib/rtw/validate.ts` (current engine), `src/lib/types.ts` (`Leg`, lines 127–153), `src/state/use-loaded-data.ts` (loader patterns), `src/lib/schemas/rtw-rule.ts` (zod conventions incl. `surfaceDistancePolicy` precedent), `public/data/airports.json` (profiled below), oneworld published continent definitions (cited inline).

---

## 1. Problem

`docs/rtw-pivot-plan.md:264` specifies `continentsVisited: string[]` in the validation summary, but `RtwValidationSummary` (`src/lib/rtw/validate.ts:26-39`) has no such field and nothing computes one. Only `oceansCrossed` exists (helper `oceansCrossed()` at `src/lib/rtw/validate.ts:238-261`, longitude-band heuristic via `regionForOcean()` at `:188-192`). First consumer will be continent-count pricing (`geography.pricingBasis: 'continents'`, already in `RtwGeographyRulesSchema` at `src/lib/schemas/rtw-rule.ts:52`) for oneworld Explorer-style products.

**Dataset facts (measured today, `public/data/airports.json`):**
- 4,563 airports, **236 distinct `country` values**, all ISO-3166-1 alpha-2 style (including non-sovereign territories as their own codes: `PF` 26, `GU` 2, `UM` 2, `RE` 2, `YT` 1, `GL` 10, `XK` 1, `AQ` 1 …).
- Entry shape: `{iata, name, city, country, lat, lon, icao?}` — `icao` absent on some rows (e.g. WHN, WKK, ZXT).
- Antarctica is actually present: `WFR` "[Duplicate] Wolf's Fang Runway", Queen Maud Island, country `AQ`. Some rows carry a `[Duplicate]` name prefix (e.g. WSI) — dataset quirks, irrelevant to this decision.

## 2. Options evaluated

| Option | Verdict | Reasoning |
|---|---|---|
| **(a) Bundled ISO country→continent lookup (~245 rows)** | **CHOSEN** | Tiny (~8 KB). Zero churn to the 4,563-row minified `airports.json`. One reviewable source of truth, reusable later for product zone tables. Trivially testable: a CI test asserts every `country` in `airports.json` has a row — this *completeness guard* is what makes the approach safe against future airport additions. Territories being separate ISO codes (`PF`, `GU`, `UM`, `GL`, `RE`…) gives correct continent placement for free (Guam → Oceania while Hawaiʻi → North America, each defensible). |
| (b) lat/lon bounding-box derivation | Rejected | Invisible magic numbers; opaque under review; fails exactly where it matters (Turkey west/east of the Bosphorus, Russia east of the Urals, Indonesia's Papuan half). Deterministic but unmaintainable, and duplicates knowledge the `country` field already encodes. |
| (c) Annotate every airport entry | Rejected | Regenerates a minified 4,563-row artifact on every fix (build script churn, huge diffs), duplicates the country field (DRY violation), bloats the shipped payload, and offers per-airport precision nobody needs. |

**Chosen: (a)**, with an optional `airportOverrides` escape hatch (empty at ship) inside the *same* file for genuinely sub-national cases (see open question Q5).

## 3. Convention decisions

### 3.1 Base model: UN geoscheme collapsed to 7 continents

Continent ids (kebab-case, mirrors `oceansCrossed`' `'pacific'|'atlantic'` style and the `t(`rtw.ocean.${ocean}`)` i18n pattern):

```
'africa' | 'antarctica' | 'asia' | 'europe' | 'north-america' | 'oceania' | 'south-america'
```

Collapse rules: Americas' three UN sub-regions (Northern/Central/Caribbean) → `north-america`; Oceania's four (Australasia, Melanesia, Micronesia, Polynesia) → `oceania`; UN "Western Asia" (incl. Cyprus, Caucasus, Middle East) → `asia`; Northern/Eastern/Western/Middle Africa → `africa`.

### 3.2 Transcontinental countries: UN geoscheme == political-capital convention

Pick **one** rule; here both standard rules agree on every case, which is why it's defensible:

| Code | Assignment | UN geoscheme | Capital convention agrees? |
|---|---|---|---|
| `RU` (158 airports) | **europe** | Russian Federation listed under Europe | ✅ Moscow is west of the Urals |
| `TR` (58) | **asia** | Western Asia (whole country) | ✅ Ankara is in Anatolia |
| `EG` (21) | **africa** | Northern Africa | ✅ Cairo |
| `KZ` (22) | **asia** | Central Asia | ✅ Astana |
| `GE`, `AZ`, `AM` | **asia** | Western Asia | ✅ Capitals lie south of the Greater Caucasus |
| `CY` (5) | **asia** | Western Asia | ✅ Nicosia (note: EU member — cosmetic oddity, accepted) |

Consequence to be **test-pinned**: `VVO` Vladivostok (`lon 132°E`) reports `europe`. Deliberate: one deterministic country-level rule beats ad-hoc sub-national splits. Product tables may split later via the override layer.

### 3.3 Oceania handling

- **Hawaiʻi (HNL, OGG, KOA, LIH…) → `north-america`** via the plain `US` row. Justification: (i) UN geoscheme is country-level and puts the US in Northern America; (ii) IATA TC areas put Hawaiʻi in Area 1 (Americas); (iii) alliance products group US points together — oneworld Explorer defines "North America (including the Caribbean, Central America and Panama)" ([oneworld RTW](https://rtw.oneworld.com/), [Explorer PDF via Qantas](https://www.qantas.com/content/dam/qac/oneworld-clue-cards/oneworld-explorer-26Apr22.pdf)). Flagged as edge case + open question Q1 because a future product table could differ; flipping costs only `airportOverrides` rows.
- **French Polynesia `PF` (PPT…) → `oceania`** — uncontroversial (Polynesia; matches oneworld "South West Pacific").
- **Pacific US territories are their own ISO codes and land correctly:** `GU` Guam → `oceania` (Micronesia), `UM` (Wake/Midway; dataset has 2) → `oceania`, `AS` → `oceania`.
- **Indonesia `ID` → `asia` entirely**, including Papuan-half airports (e.g. WMX Wamena, lon ≈139°E). Industry treats Indonesia as Asia; geographic purism would split it — rejected at country level, documented here.
- Australian external territories `CX`, `CC`, `NF` → `oceania` (political assignment; UN geoscheme doesn't enumerate them).

### 3.4 Known divergence from product tables — keep them OUT of this file

oneworld's published continent definitions are idiosyncratic and **cannot** be encoded by any neutral base map: their "Middle East" continent *includes Algeria, Armenia, Azerbaijan, Egypt, Georgia, Libya* ([rtw.oneworld.com](https://rtw.oneworld.com/)); their zones are 3 (Zone 1: Americas; Zone 2: Europe+Middle East+Africa; Zone 3: Asia+SW Pacific) ([oneworld.com/round-the-world](https://www.oneworld.com/round-the-world)); Circle Pacific uses a 4-continent model (Asia, North America, South America, Southwest Pacific). Therefore: **this file is the neutral geographic base only**; product-specific continent/zone tables (with their own exception rows) are a future layer that consumes it. This mirrors how `surfaceDistancePolicy` stayed per-product instead of global.

## 4. Data file proposal

### 4.1 Path

```
public/data/geo/current.json          ← the mapping (fetched like other catalogs)
src/lib/schemas/country-continent.ts  ← zod schema
src/lib/rtw/continents.ts             ← pure engine helpers (NO React imports)
```

`current.json` naming follows the established loader pattern (`fetchJsonStrict(`${baseUrl}/data/alliances/current.json")`, `use-loaded-data.ts:85`). Geography doesn't drift quarterly like rules, so a version *field inside the file* (`version`, `convention`, `lastVerified`, `sourceUrls`) suffices; no dated snapshots unless a convention change ever happens.

### 4.2 Zod schema sketch (`src/lib/schemas/country-continent.ts`)

```ts
import { z } from 'zod';

export const ContinentSchema = z.enum([
  'africa', 'antarctica', 'asia', 'europe',
  'north-america', 'oceania', 'south-america',
]);
export type ContinentId = z.infer<typeof ContinentSchema>;

export const AirportContinentOverrideSchema = z.object({
  iata: z.string().regex(/^[A-Z]{3}$/),
  continent: ContinentSchema,
  reason: z.string().min(1),            // required — every override must justify itself
});

export const CountryContinentEntrySchema = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  continent: ContinentSchema,
});

export const CountryContinentCatalogSchema = z
  .object({
    version: z.string().regex(/^\d{4}\.\d$/),
    convention: z.literal('un-geoscheme-country-level'),
    lastVerified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceUrls: z.array(z.string().url()).min(1),
    mappings: z.array(CountryContinentEntrySchema),
    airportOverrides: z.array(AirportContinentOverrideSchema).default([]),
  })
  .superRefine((catalog, ctx) => {
    const seen = new Set<string>();
    for (const m of catalog.mappings) {
      if (seen.has(m.country)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom,
          message: `Duplicate country row: ${m.country}` });
      }
      seen.add(m.country);
    }
    const known = new Set(catalog.mappings.map((m) => m.country));
    for (const o of catalog.airportOverrides) {
      // structural check only; airport-existence check lives in unit tests
      if (known.size === 0) break;
    }
  });

export type CountryContinentCatalog = z.infer<typeof CountryContinentCatalogSchema>;
```

Conventions matched to `src/lib/schemas/rtw-rule.ts`: kebab enum ids, `.default()`, provenance fields (`lastVerified` regex, ≥1 `sourceUrls`), `.superRefine` for cross-row uniqueness.

### 4.3 Engine helpers (`src/lib/rtw/continents.ts`, pure — ESLint calc-purity applies spiritually)

```ts
export function continentForCountry(
  country: string,
  lookup: ReadonlyMap<string, ContinentId>,
): ContinentId | undefined;

export function continentsVisited(
  legs: ReadonlyArray<Leg>,
  inputs: Pick<RtwValidationInputs, 'airports' | 'countryContinents'>,
): ReadonlyArray<ContinentId>;
// walk legs IN ORDER; for each leg visit `from` then `to`;
// resolve airport → country → continent; push if not already present;
// skip unknown airports / unmapped countries silently;
// surface legs contribute BOTH endpoints (see §5).
```

### 4.4 Wiring

- `RtwValidationInputs` (`validate.ts:48-51`) gains `readonly countryContinents: ReadonlyMap<string, ContinentId>;`
- `use-loaded-data.ts`: add one entry to the `Promise.all` — `fetchJsonStrict(`${baseUrl}/data/geo/current.json`)` — parse with `CountryContinentCatalogSchema.parse(...)`, build the `Map` once alongside `allianceCatalog` (`use-loaded-data.ts:82,106` pattern).
- `validate.ts`: compute once next to `crossedOceans` (near `:277`), insert into the returned summary object **before** `oceansCrossed` (construction site `:640-653`, insertion point ≈ `:648`) to mirror the pivot-plan field order (`docs/rtw-pivot-plan.md:264-265`).
- Tests load the JSON via `readFileSync('public/data/geo/current.json', 'utf8')` exactly like `tests/calibration/flyertalk-routings.test.ts:58`.
- UI: render next to the oceans chip using `t(`rtw.continent.${id}`)` keys — same pattern as `src/components/RtwValidationPanel.tsx:148`; i18n files gain 7 `rtw.continent.*` keys.
- URL schema untouched: the summary is derived state, never encoded.

### 4.5 FULL draft mapping content (`public/data/geo/current.json`)

Coverage: all **236** country codes observed in `airports.json` + **13** unobserved-but-standard ISO codes (`AD AX BV GS HM LI MC PN SJ SM TF TK VA`) so future airport additions can never break the completeness test → **249 rows**. Ordered by continent, alphabetical within. Copy verbatim; fill `version`/`lastVerified` at land time.

```json
{
  "version": "2026.2",
  "convention": "un-geoscheme-country-level",
  "lastVerified": "2026-05-24",
  "sourceUrls": [
    "https://unstats.un.org/unsd/methodology/m49/",
    "https://www.oneworld.com/round-the-world"
  ],
  "airportOverrides": [],
  "mappings": [
    {"country":"AO","continent":"africa"},{"country":"BF","continent":"africa"},{"country":"BI","continent":"africa"},
    {"country":"BJ","continent":"africa"},{"country":"BW","continent":"africa"},{"country":"CD","continent":"africa"},
    {"country":"CF","continent":"africa"},{"country":"CG","continent":"africa"},{"country":"CI","continent":"africa"},
    {"country":"CM","continent":"africa"},{"country":"CV","continent":"africa"},{"country":"DJ","continent":"africa"},
    {"country":"DZ","continent":"africa"},{"country":"EG","continent":"africa"},{"country":"EH","continent":"africa"},
    {"country":"ER","continent":"africa"},{"country":"ET","continent":"africa"},{"country":"GA","continent":"africa"},
    {"country":"GH","continent":"africa"},{"country":"GM","continent":"africa"},{"country":"GN","continent":"africa"},
    {"country":"GQ","continent":"africa"},{"country":"GW","continent":"africa"},{"country":"IO","continent":"africa"},{"country":"KE","continent":"africa"},
    {"country":"KM","continent":"africa"},{"country":"LR","continent":"africa"},{"country":"LS","continent":"africa"},
    {"country":"LY","continent":"africa"},{"country":"MA","continent":"africa"},{"country":"MG","continent":"africa"},
    {"country":"ML","continent":"africa"},{"country":"MR","continent":"africa"},{"country":"MU","continent":"africa"},
    {"country":"MW","continent":"africa"},{"country":"MZ","continent":"africa"},{"country":"NA","continent":"africa"},
    {"country":"NE","continent":"africa"},{"country":"NG","continent":"africa"},{"country":"RE","continent":"africa"},
    {"country":"RW","continent":"africa"},{"country":"SC","continent":"africa"},{"country":"SD","continent":"africa"},
    {"country":"SH","continent":"africa"},{"country":"SL","continent":"africa"},{"country":"SN","continent":"africa"},
    {"country":"SO","continent":"africa"},{"country":"SS","continent":"africa"},{"country":"ST","continent":"africa"},
    {"country":"SZ","continent":"africa"},{"country":"TD","continent":"africa"},{"country":"TG","continent":"africa"},
    {"country":"TN","continent":"africa"},{"country":"TZ","continent":"africa"},{"country":"UG","continent":"africa"},
    {"country":"YT","continent":"africa"},{"country":"ZA","continent":"africa"},{"country":"ZM","continent":"africa"},
    {"country":"ZW","continent":"africa"},

    {"country":"AQ","continent":"antarctica"},{"country":"BV","continent":"antarctica"},
    {"country":"GS","continent":"antarctica"},{"country":"HM","continent":"antarctica"},
    {"country":"TF","continent":"antarctica"},

    {"country":"AE","continent":"asia"},{"country":"AF","continent":"asia"},{"country":"AM","continent":"asia"},
    {"country":"AZ","continent":"asia"},{"country":"BD","continent":"asia"},{"country":"BH","continent":"asia"},
    {"country":"BN","continent":"asia"},{"country":"BT","continent":"asia"},{"country":"CN","continent":"asia"},{"country":"CY","continent":"asia"},
    {"country":"GE","continent":"asia"},{"country":"HK","continent":"asia"},{"country":"ID","continent":"asia"},
    {"country":"IL","continent":"asia"},{"country":"IN","continent":"asia"},{"country":"IQ","continent":"asia"},
    {"country":"IR","continent":"asia"},{"country":"JO","continent":"asia"},{"country":"JP","continent":"asia"},
    {"country":"KG","continent":"asia"},{"country":"KH","continent":"asia"},{"country":"KP","continent":"asia"},
    {"country":"KR","continent":"asia"},{"country":"KW","continent":"asia"},{"country":"KZ","continent":"asia"},
    {"country":"LA","continent":"asia"},{"country":"LB","continent":"asia"},{"country":"LK","continent":"asia"},
    {"country":"MM","continent":"asia"},{"country":"MN","continent":"asia"},{"country":"MO","continent":"asia"},
    {"country":"MV","continent":"asia"},{"country":"MY","continent":"asia"},{"country":"NP","continent":"asia"},
    {"country":"OM","continent":"asia"},{"country":"PH","continent":"asia"},{"country":"PK","continent":"asia"},
    {"country":"QA","continent":"asia"},{"country":"SA","continent":"asia"},{"country":"SG","continent":"asia"},
    {"country":"SY","continent":"asia"},{"country":"TH","continent":"asia"},{"country":"TJ","continent":"asia"},
    {"country":"TL","continent":"asia"},{"country":"TM","continent":"asia"},{"country":"TR","continent":"asia"},
    {"country":"TW","continent":"asia"},{"country":"UZ","continent":"asia"},{"country":"VN","continent":"asia"},
    {"country":"YE","continent":"asia"},

    {"country":"AD","continent":"europe"},{"country":"AL","continent":"europe"},{"country":"AT","continent":"europe"},
    {"country":"AX","continent":"europe"},{"country":"BA","continent":"europe"},{"country":"BE","continent":"europe"},
    {"country":"BG","continent":"europe"},{"country":"BY","continent":"europe"},{"country":"CH","continent":"europe"},
    {"country":"CZ","continent":"europe"},{"country":"DE","continent":"europe"},{"country":"DK","continent":"europe"},
    {"country":"EE","continent":"europe"},{"country":"ES","continent":"europe"},{"country":"FI","continent":"europe"},
    {"country":"FO","continent":"europe"},{"country":"FR","continent":"europe"},{"country":"GB","continent":"europe"},
    {"country":"GG","continent":"europe"},{"country":"GI","continent":"europe"},{"country":"GR","continent":"europe"},
    {"country":"HR","continent":"europe"},{"country":"HU","continent":"europe"},{"country":"IE","continent":"europe"},
    {"country":"IM","continent":"europe"},{"country":"IS","continent":"europe"},{"country":"IT","continent":"europe"},
    {"country":"JE","continent":"europe"},{"country":"LI","continent":"europe"},{"country":"LT","continent":"europe"},
    {"country":"LU","continent":"europe"},{"country":"LV","continent":"europe"},{"country":"MC","continent":"europe"},
    {"country":"MD","continent":"europe"},{"country":"ME","continent":"europe"},{"country":"MK","continent":"europe"},
    {"country":"MT","continent":"europe"},{"country":"NL","continent":"europe"},{"country":"NO","continent":"europe"},
    {"country":"PL","continent":"europe"},{"country":"PT","continent":"europe"},{"country":"RO","continent":"europe"},
    {"country":"RS","continent":"europe"},{"country":"RU","continent":"europe"},{"country":"SE","continent":"europe"},
    {"country":"SI","continent":"europe"},{"country":"SJ","continent":"europe"},{"country":"SK","continent":"europe"},
    {"country":"SM","continent":"europe"},{"country":"UA","continent":"europe"},{"country":"VA","continent":"europe"},
    {"country":"XK","continent":"europe"},

    {"country":"AG","continent":"north-america"},{"country":"AI","continent":"north-america"},
    {"country":"AW","continent":"north-america"},{"country":"BB","continent":"north-america"},
    {"country":"BL","continent":"north-america"},{"country":"BM","continent":"north-america"},
    {"country":"BQ","continent":"north-america"},{"country":"BS","continent":"north-america"},
    {"country":"BZ","continent":"north-america"},{"country":"CA","continent":"north-america"},
    {"country":"CR","continent":"north-america"},{"country":"CU","continent":"north-america"},
    {"country":"CW","continent":"north-america"},{"country":"DM","continent":"north-america"},
    {"country":"DO","continent":"north-america"},{"country":"GD","continent":"north-america"},
    {"country":"GL","continent":"north-america"},{"country":"GP","continent":"north-america"},
    {"country":"GT","continent":"north-america"},{"country":"HN","continent":"north-america"},
    {"country":"HT","continent":"north-america"},{"country":"JM","continent":"north-america"},
    {"country":"KN","continent":"north-america"},{"country":"KY","continent":"north-america"},
    {"country":"LC","continent":"north-america"},{"country":"MF","continent":"north-america"},
    {"country":"MQ","continent":"north-america"},{"country":"MS","continent":"north-america"},
    {"country":"MX","continent":"north-america"},{"country":"NI","continent":"north-america"},
    {"country":"PA","continent":"north-america"},{"country":"PM","continent":"north-america"},
    {"country":"PR","continent":"north-america"},{"country":"SV","continent":"north-america"},
    {"country":"SX","continent":"north-america"},{"country":"TC","continent":"north-america"},
    {"country":"TT","continent":"north-america"},{"country":"US","continent":"north-america"},
    {"country":"VC","continent":"north-america"},{"country":"VG","continent":"north-america"},
    {"country":"VI","continent":"north-america"},

    {"country":"AR","continent":"south-america"},{"country":"BO","continent":"south-america"},
    {"country":"BR","continent":"south-america"},{"country":"CL","continent":"south-america"},
    {"country":"CO","continent":"south-america"},{"country":"EC","continent":"south-america"},
    {"country":"FK","continent":"south-america"},{"country":"GF","continent":"south-america"},
    {"country":"GY","continent":"south-america"},{"country":"PE","continent":"south-america"},
    {"country":"PY","continent":"south-america"},{"country":"SR","continent":"south-america"},
    {"country":"UY","continent":"south-america"},{"country":"VE","continent":"south-america"},

    {"country":"AS","continent":"oceania"},{"country":"AU","continent":"oceania"},
    {"country":"CC","continent":"oceania"},{"country":"CK","continent":"oceania"},
    {"country":"CX","continent":"oceania"},{"country":"FJ","continent":"oceania"},{"country":"FM","continent":"oceania"},
    {"country":"GU","continent":"oceania"},{"country":"KI","continent":"oceania"},
    {"country":"MH","continent":"oceania"},{"country":"MP","continent":"oceania"},
    {"country":"NC","continent":"oceania"},{"country":"NF","continent":"oceania"},
    {"country":"NR","continent":"oceania"},{"country":"NU","continent":"oceania"},
    {"country":"NZ","continent":"oceania"},{"country":"PF","continent":"oceania"},
    {"country":"PG","continent":"oceania"},{"country":"PN","continent":"oceania"},
    {"country":"PW","continent":"oceania"},{"country":"SB","continent":"oceania"},
    {"country":"TK","continent":"oceania"},{"country":"TO","continent":"oceania"},
    {"country":"TV","continent":"oceania"},{"country":"UM","continent":"oceania"},
    {"country":"VU","continent":"oceania"},{"country":"WF","continent":"oceania"},
    {"country":"WS","continent":"oceania"}
  ]
}
```

Row counts by continent: africa 59 · antarctica 5 · asia 50 · europe 52 · north-america 41 · oceania 28 · south-america 14 = **249**.

## 5. Summary field semantics (recommendation)

```ts
// RtwValidationSummary addition (validate.ts:26-39 interface; object literal ≈:648):
readonly continentsVisited: ReadonlyArray<ContinentId>;
```

- **Name/type:** `continentsVisited: ReadonlyArray<'africa'|'antarctica'|'asia'|'europe'|'north-america'|'oceania'|'south-america'>` — keeps the pivot plan's name (`docs/rtw-pivot-plan.md:264`); kebab-case ids match `oceansCrossed` and enable `t(`rtw.continent.${id}`)`.
- **Order semantics: unique, first-visit order.** Walk legs in itinerary order; each leg contributes its `from` continent then `to` continent; dedupe keeping the first occurrence. Rationale: display-friendly ("Asia → Europe → North America"), deterministic, and trivially convertible to a Set/count downstream — whereas an unordered set loses the narrative order users expect. Start point always counts.
- **Surface-leg policy: surface sectors DO count as visited (both endpoints).** Justification: (i) physical presence — you stood in Cairo however you got there; (ii) internal precedent — `surfaceCityCounts()` (`validate.ts:222-236`) already counts both endpoints of surface legs, while `oceansCrossed()` (`:244`) skips them; the asymmetry is principled: **crossing requires flying over; visiting requires being there**; (iii) no surveyed RTW product ignores surface-visited continents (contrast distance, where ANA excluded surface — hence `surfaceDistancePolicy`). Not a per-product knob in v1; revisit only if a product demands it (open question Q2).
- Unknown airports / unmapped countries: skipped silently (matches the engine's existing graceful degradation, e.g. `totalDistanceMiles` skipping unknown airports, `validate.ts:103-105`). Empty route → `[]`.

## 6. Edge cases

| Case | Result | Why / consequence |
|---|---|---|
| `SVO`/`DME` Moscow AND `VVO` Vladivostok (`RU`) | `europe` | Single-convention rule (§3.2); test-pin VVO to prevent "fixing" it |
| `IST` Istanbul (`TR`) | `asia` | Whole-country Western Asia |
| `CAI` (`EG`) | `africa` | Even though oneworld product tables put Egypt in "Middle East" — product-layer concern |
| `ALA` Almaty (`KZ`), `TBS` (`GE`), `GYD` (`AZ`), `EVN` (`AM`) | `asia` | §3.2 |
| `HNL`, `OGG`, `KOA` (`US-HI`) | `north-america` | US row; industry-aligned; flip costs override rows (Q1) |
| `PPT` (`PF`), `AKL` (`NZ`), `NAN` (`FJ`) | `oceania` | Uncontroversial Polynesia/Melanesia/Australasia |
| `GUM` (`GU`), Wake/Midway (`UM`) | `oceania` | Territory ISO codes place them in Micronesia — country-keying win |
| `KEF`/`GL` Greenland | `north-america` | UN geoscheme: Northern America (not Europe despite Denmark link) |
| `RUN` Réunion (`RE`), Dzaoudzi (`YT`) | `africa` | UN geoscheme Eastern Africa, despite France sovereignty |
| `WMX` Wamena, Indonesian Papua (`ID`) | `asia` | Whole-country rule; industry treats Indonesia as Asia |
| `WFR` Wolf's Fang Runway (`AQ`) | `antarctica` | Only dataset row; exercises the 7th enum value |
| `PRN` Priština (`XK`) | `europe` | User-assigned code used by OurAirports; pragmatic call |
| `XCH` Christmas Is. (`CX`), Cocos (`CC`), Norfolk (`NF`) | `oceania` | Australian external territories |
| Panama (`PA`), Mexico (`MX`), all Caribbean | `north-america` | Matches oneworld Explorer's own NA definition verbatim |
| `DZ`/`LY`/`MA` North Africa | `africa` | Base map; oneworld's "Middle East" continent claims DZ/LY — override layer's job later |

## 7. Unit tests (ordered implementation list)

File: `tests/lib/rtw/continents.test.ts` (helpers) + additions to `tests/lib/rtw/validate.test.ts` (integration).

1. **Core seven (required picks):** `continentForCountry` via airports — TPE/TW→`asia`; SIN/SG→`asia`; CGK/ID→`asia`; BKK/TH→`asia`; LHR/GB→`europe`; JFK/US→`north-america`; SYD/AU→`oceania`.
2. **Transcontinental picks:** SVO/RU→`europe`; IST/TR→`asia`; CAI/EG→`africa`; ALA/KZ→`asia`; TBS/GE→`asia`; GYD/AZ→`asia`.
3. **Oceania traps:** HNL→`north-america`; PPT→`oceania`; GUM→`oceania`; AWK (Wake, `UM`)→`oceania`; AKL→`oceania`.
4. **Territories:** GL→`north-america`; RE→`africa`; YT→`africa`; HK/MO→`asia`; PRN/XK→`europe`; WFR/AQ→`antarctica`; XCH/CX→`oceania`.
5. **Order + dedup (property):** legs TPE→LHR→JFK→SYD→TPE yields exactly `['asia','europe','north-america','oceania']` — first-visit order, closing loop does not re-add `asia`.
6. **Single-continent collapse:** SIN→CGK→BKK yields `['asia']` (length 1).
7. **Surface inclusion:** `[GRU→EZE surface:true, EZE→JFK flight]` yields `['south-america','north-america']` — proves a continent reached *only* via a surface endpoint still counts; assert on the same fixture that `oceansCrossed` behavior is unchanged (surface skipped).
8. **Graceful degradation:** leg referencing unknown IATA `XXX` is skipped without throwing; an airport whose country is unmapped contributes nothing; empty legs → `[]`.
9. **Completeness guard (CI-critical):** every distinct `country` value in `public/data/airports.json` (readFileSync, calibration-test pattern) exists in `public/data/geo/current.json` mappings. This test is what makes approach (a) safe forever.
10. **Zod schema:** valid catalog parses; `"USA"` rejects; `"eurasia"` rejects; duplicate country row rejects via superRefine.
11. **Integration:** `validateRtwRoute(...).summary.continentsVisited` equals helper output on an existing fixture from `tests/lib/rtw/validate.test.ts` and on one calibration routing; existing assertions stay green (field is additive).
12. **UI smoke (optional):** `RtwValidationPanel` renders localized continent labels when the summary carries values (mirrors oceans-chip component test).

## 8. Open questions for the captain

1. **Hawaiʻi** — confirm `north-america` (recommended; industry-aligned). If a future product disagrees, we add `airportOverrides` rows for HI fields rather than touching the country row.
2. **Surface counting** — confirm "always counts, not a per-product knob" for v1 (recommended). A `surfaceContinentPolicy` analogous to `surfaceDistancePolicy` can be added later without breaking the summary contract.
3. **Order semantics** — first-visit order (recommended) vs alphabetical set. First-visit preserves narrative and is strictly more informative.
4. **Scope cut** — defer the `minContinents`/`maxContinents` limits + `'continents-count'` finding and the oneworld product continent tables (incl. the DZ/EG/LY-in-Middle-East quirk) until the Explorer-pricing slice? Recommended: yes; this decision only lands the base map + summary.
5. **`airportOverrides` mechanism** — ship it empty (my lean: yes, cheap escape hatch, tested by schema) or omit until first real need (YAGNI)?
6. **Adjacent debt (out of scope):** `airports.json` itself is only `Array.isArray`-checked (`use-loaded-data.ts:104`), unlike every zod-validated catalog. Worth its own task someday; the new completeness test incidentally guards airport country codes.
7. **Antarctica** — keep the enum value though only `WFR` maps there (recommended; zero cost, avoids a migration if an AQ airport ever appears in a routing).

## 9. Sources

- oneworld RTW overview (zones/continents): https://www.oneworld.com/round-the-world
- oneworld RTW continent definitions (Middle East incl. DZ/AM/AZ/EG/GE/LY; NA incl. Caribbean/Central America/Panama): https://rtw.oneworld.com/
- oneworld Explorer fare rules PDF (NA definition wording): https://www.qantas.com/content/dam/qac/oneworld-clue-cards/oneworld-explorer-26Apr22.pdf
- UN M49 geoscheme (assignment basis): https://unstats.un.org/unsd/methodology/m49/
- Dataset profile measured from `public/data/airports.json` (4,563 rows / 236 countries, 2026-05-24)
