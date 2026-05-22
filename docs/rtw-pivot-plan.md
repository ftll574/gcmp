# RTW Planner Pivot Plan

Last updated: 2026-05-23

## Product Reset

The app is no longer primarily a mileage earning calculator.

New product definition:

> gcmp plans and validates round-the-world routings across airline alliances and mileage programs.

The map, airport search, multi-leg routing, share URLs, i18n, saved routings, and distance engine remain useful. The earning calculator becomes a secondary module, not the first-screen workflow.

## User Job

The user is trying to answer:

1. Can this around-the-world route be ticketed under a known RTW fare or award rule?
2. Which alliance or mileage program can support it?
3. Which leg violates the rule, and how should I fix it?
4. How many segments, stopovers, surface sectors, oceans, zones, regions, and miles have I used?
5. Which airlines are actually usable on each leg?

## Product Lines To Model Separately

Do not merge these into one generic "program" schema.

### 1. Alliance Cash RTW Fares

Examples:

- oneworld Explorer
- oneworld Global Explorer
- Star Alliance Round the World fare

These are paid fares. They may still earn miles, but earning is not the primary validation problem.

Primary validation concerns:

- alliance membership
- start/end constraints
- continuous eastbound or westbound travel
- Atlantic and Pacific crossing requirements
- continent or mileage band
- max flight coupons / segments
- stopover minimum and maximum
- trip duration
- surface sectors / open jaws

### 2. Mileage / Award RTW Or Multi-Carrier Awards

Examples:

- ANA Mileage Club Star Alliance Round the World award
- Qantas oneworld Classic Flight Reward
- Cathay Asia Miles oneworld Multi-Carrier Award

These are redeemed with points/miles. Availability is not fully knowable from static data, so v1 should validate structural eligibility and show availability as "unknown / must search."

Primary validation concerns:

- eligible operating airlines
- eligible alliance or partner set
- max total flown distance
- award chart distance band
- max flight sectors
- max stopovers
- max transfers
- surface sector accounting
- mixed-cabin pricing rule
- minimum trip duration
- route direction and ocean crossing rules

## Current Source Findings

Use official sources as the first-class source. Community reports can only become notes or confidence annotations.

### oneworld RTW Cash Fare

Source: https://www.oneworld.com/round-the-world

Important v1 rules:

- oneworld offers three RTW products: oneworld Explorer, Global Explorer, and Circle Pacific.
- oneworld Explorer is continent-based.
- Global Explorer is distance-based.
- oneworld Explorer planning tips state:
  - trip must move continuously east or west between Zone 1, Zone 2, and Zone 3
  - backtracking within a continent is generally permitted, with exclusions
  - trip must start and finish in the same city
  - trip must cross both Atlantic and Pacific oceans
  - journey can include 3 to 6 continents
  - journey can include 3 to 16 flights
  - trip duration is 10 days to 1 year

### Star Alliance RTW Cash Fare

Source: https://roundtheworld.staralliance.com/staralliance/en/round-the-world

Important v1 rules:

- Start and end in the same country.
- Follow one global direction: east or west.
- Cross both the Atlantic and Pacific oceans.
- Minimum 2 stops, maximum 15 stops.
- Maximum 16 flights.
- Travel duration: 10 days to 1 year.
- Stopover is 24h or more; transfer is less than 24h.

### ANA Star Alliance RTW Award

Source: https://www.ana.co.jp/en/gb/amc/partner-flight-awards/around-the-world/

Important status:

- ANA stopped issuing new Star Alliance Round the World award tickets as of 2025-06-23.
- Existing tickets issued up to that date can still be used until expiration.

Historical / reference rules still useful for archived validation mode:

- Eligible flights: Star Alliance member airlines.
- Required mileage is based on total basic sector mileage, excluding ground transport sectors.
- Must cross both Atlantic and Pacific once.
- Direction must be east-to-west or west-to-east.
- Backtracking is not permitted.
- Up to 8 stopovers.
- Up to 12 flight sectors.
- Up to 4 ground transport sectors.
- Final international flight returning to country of departure must depart at least 10 days after first international flight.

### Qantas oneworld Classic Flight Reward

Sources:

- https://www.qantas.com/ch/en/frequent-flyer/use-points/classic-flight-rewards.html
- https://www.qantas.com/ca/en/frequent-flyer/discover-and-join/terms-and-conditions.html

Important v1 rules:

- Limited to oneworld member airlines and affiliates.
- Must include at least two oneworld member airlines other than Qantas.
- Max itinerary distance: 35,000 miles / 56,315 km.
- Up to five free stopovers.
- More than five stopovers are not permitted.
- Only one stopover in any one city.
- Only two transfers in any one city.
- Surface segments are permitted, but surface distance counts toward the reward zone calculation.
- Mixed-cabin itinerary prices at the highest class booked.

## Alliance Membership Data

Alliance membership changes and must be versioned.

Known current deltas that matter:

- oneworld welcomed Oman Air as its 15th member in 2025.
- oneworld welcomed Hawaiian Airlines as a member in 2026.
- Star Alliance added ITA Airways in 2026.
- SAS moved to SkyTeam in 2024.
- ANA Star Alliance RTW award is discontinued for new ticketing as of 2025-06-23.

The app should not hardcode alliance membership inside UI components. It needs versioned data files:

```text
public/data/alliances/v2026.2.json
public/data/alliances/current.json
```

Seed status:

- `public/data/alliances/current.json` exists.
- Active full members currently covered:
  - oneworld: 16
  - Star Alliance: 26
  - SkyTeam: 18
- S7 is represented as a suspended oneworld member.
- Affiliate / regional / connect carriers are intentionally deferred until product-specific RTW rules require them.

Each airline entry should include:

```ts
type AirlineAllianceMembership = {
  airline: string;              // IATA, e.g. "JL"
  alliance: 'oneworld' | 'star' | 'skyteam' | 'none';
  status: 'member' | 'affiliate' | 'connect' | 'suspended' | 'former';
  effectiveFrom?: string;
  effectiveTo?: string;
  sourceUrl: string;
};
```

## Proposed Rule Schema

Use separate schemas for alliance fares and award products.

```ts
type RtwProductKind = 'cash-rtw-fare' | 'award-rtw' | 'multi-carrier-award';

type RtwRuleSet = {
  id: string;
  label: string;
  kind: RtwProductKind;
  owner: 'oneworld' | 'star' | 'skyteam' | 'airline';
  airline?: string;
  alliance?: 'oneworld' | 'star' | 'skyteam';
  version: string;
  status: 'active' | 'discontinued' | 'archived';
  bookingStatusNote?: string;
  sourceUrls: string[];
  limits: {
    minFlights?: number;
    maxFlights?: number;
    minStopovers?: number;
    maxStopovers?: number;
    maxTransfersPerCity?: number;
    maxStopoversPerCity?: number;
    maxSurfaceSectors?: number;
    maxDistanceMiles?: number;
    minTripDays?: number;
    maxTripMonths?: number;
  };
  geography: {
    startEnd: 'same-city' | 'same-country' | 'open';
    directionPolicy: 'east-or-west-continuous' | 'no-backtracking' | 'flexible';
    requiresAtlanticCrossing?: boolean;
    requiresPacificCrossing?: boolean;
    oceanCrossingCount?: 'once' | 'at-least-once';
    pricingBasis?: 'continents' | 'distance' | 'zones';
  };
  airlineEligibility: {
    type: 'alliance-members' | 'explicit-airline-set';
    alliance?: 'oneworld' | 'star' | 'skyteam';
    airlines?: string[];
    includeAffiliates?: boolean;
  };
};
```

## Validation Output Shape

The engine should return typed findings, not strings.

```ts
type RuleSeverity = 'pass' | 'warning' | 'fail' | 'unknown';

type RtwFinding = {
  ruleId: string;
  severity: RuleSeverity;
  message: string;
  affectedLegIndexes?: number[];
  sourceUrl?: string;
};

type RtwValidationResult = {
  productId: string;
  valid: boolean;
  summary: {
    flightSegments: number;
    surfaceSectors: number;
    stopovers: number;
    transfers: number;
    totalDistanceMiles: number;
    continentsVisited: string[];
    oceansCrossed: string[];
    direction: 'eastbound' | 'westbound' | 'mixed' | 'unknown';
  };
  findings: RtwFinding[];
};
```

## UI Pivot

First screen should ask:

- Which RTW product are you planning?
- Origin city
- Desired stopovers
- Cabin
- Passenger count

The main panel should become a rule checklist:

- Flights used
- Stopovers used
- Surface sectors
- Total miles / pricing band
- Continents / zones visited
- Ocean crossings
- Direction / backtracking
- Airline eligibility per segment

The old earning panel should move behind an optional tab:

- "Mileage earning estimate"
- "Credit this paid RTW fare to..."

## First Implementation Slice

Do this before touching visual polish:

1. Add `src/lib/rtw/**` pure engine module.
2. Add `src/lib/schemas/rtw-rule.ts` zod schema.
3. Add `public/data/alliances/current.json`.
4. Add `public/data/rtw-products/current.json`.
5. Implement validators for:
   - segment count
   - same city / same country start-end
   - total distance
   - stopover count, using user-supplied stopover vs transfer metadata
   - eligible alliance airlines per leg
6. Add unit tests for oneworld Explorer, Star Alliance RTW fare, ANA archived RTW award, Qantas oneworld Classic Flight Reward.
7. Replace the first-screen UI from earning/program picker to RTW product selector and validation checklist.

## Data We Still Need

This needs proper research before encoding:

- Exact continent/zone mapping for oneworld Explorer and Global Explorer.
- Current full oneworld Explorer PDF rules.
- Current full Global Explorer PDF rules.
- Star Alliance detailed fare rules by mileage band.
- Whether SkyTeam currently offers a comparable public RTW fare product.
- EVA award-zone pricing chart extraction for Star Alliance World Travel Award.
- Cathay Asia Miles award-zone pricing display for oneworld Multi-Carrier Award.
- JAL, BA, Alaska, AA, Aeroplan, Flying Blue complex award routing limits, if any are in scope.

## Product Principle

Award availability is not a static-rule problem.

For v1, the app can say:

- structurally valid
- structurally invalid
- carrier eligible
- carrier not eligible
- availability unknown

It should not claim a route is bookable unless it has live award availability integration.
