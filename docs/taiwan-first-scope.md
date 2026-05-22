# Taiwan-First RTW Scope

Last updated: 2026-05-23

## Product Priority

The first launch market is Taiwan.

This means the first useful product should answer Taiwan-origin questions before trying to be globally complete:

1. Which RTW fare or award product can a Taiwan-based user realistically use?
2. Which local or nearby airline programs matter?
3. Which products look relevant but are not valid for true RTW?
4. Which routings from TPE/TSA/KHH/RMQ violate the rules?

## Taiwan Priority Programs

### Primary

#### EVA Air Infinity MileageLands

Role: Taiwan home program, Star Alliance.

Why it matters:

- EVA is a Taiwan home carrier and Star Alliance member.
- EVA publishes Star Alliance partner award rules.
- EVA states Star Alliance award tickets with stopovers and Star Alliance World Travel Award ticket service are handled through reservation/ticketing offices.

Product implication:

- `br-infinity-star-alliance-world-travel-award` is now in `public/data/rtw-products/current.json`.
- Implemented first-pass validation: Star Alliance operating carriers, max 10 flight sectors, max 7 stopovers, same-country return, one-direction RTW structure, Pacific + Atlantic crossing requirement metadata.
- Still pending: date-based 10+ day validation and region/backtracking implementation.

Sources:

- https://www.evaair.com/zh-tw/plan-and-book/where-we-fly/star-alliance-networks/
- https://www.evaair.com/en-us/infinity-mileagelands/mileage-award-program/mileage-redemption/award-ticket/star-alliance/

#### Cathay Asia Miles

Role: Nearby hub program, oneworld multi-carrier award candidate.

Why it matters:

- Hong Kong is a practical nearby hub for Taiwan users.
- Cathay is a oneworld member and Asia Miles is a common oneworld redemption path.
- Asia Miles terms reference oneworld Multi-Carrier Awards.

Product implication:

- `cx-asia-miles-oneworld-multi-carrier-award` is now in `public/data/rtw-products/current.json`.
- Implemented first-pass validation: oneworld operating carriers, 50,000 mile cap, max 5 stopovers, max 2 transfers, max 2 open-jaws/surface sectors, and the CX carrier-combination rule.
- Still pending: per-city stopover/open-jaw validation and award-zone pricing display.

Sources:

- https://www.cathaypacific.com/cx/en_TW/rewards-and-partnerships/oneworld/frequent-flyer-benefits.html
- https://www.cathaypacific.com/content/dam/focal-point/cx/membership/programme-update/Cathay-membership-programme-terms-and-conditions-2026-enTW.pdf

### Important But Limited / Not RTW

#### China Airlines Dynasty Flyer

Role: Taiwan home program, SkyTeam.

Why it matters:

- China Airlines is a Taiwan home carrier and SkyTeam member.
- Dynasty Flyer is highly relevant for Taiwan users.

RTW caveat:

- China Airlines SkyTeam partner award rules explicitly say itineraries crossing both the Pacific and Atlantic are not accepted.
- That makes it important for complex SkyTeam award planning, but not a true RTW award product.

Product implication:

- Show CI as Taiwan-important but mark RTW relevance as negative for true round-the-world validation.
- This is a good example of why the UI needs "not eligible for RTW" explanations, not just omission.

Source:

- https://www.china-airlines.com/us/en/member/redeem-airline-miles/skyteam-partners/reward-tickets-skyteam

#### STARLUX COSMILE

Role: Taiwan home program, watchlist.

Why it matters:

- STARLUX is a Taiwan home carrier.
- COSMILE is important for Taiwan users.

RTW caveat:

- STARLUX is not currently in a global alliance.
- Published airline partner redemption is currently centered on Alaska Airlines.

Product implication:

- Include JX/COSMILE in Taiwan profile.
- Do not treat it as an RTW backbone until alliance membership or broader partner rules exist.

Source:

- https://www.starlux-airlines.com/en-TW/cosmile/cosmile-plan/redeem-award-ticket-Asia/Airline-Alliance

### Secondary Nearby-Hub Programs

#### JAL Mileage Bank

Role: Nearby hub, oneworld.

Why it matters:

- Japan is a practical connection point from Taiwan.
- JAL publishes oneworld award ticket information for Taiwan users.

Source:

- https://www.jal.co.jp/tw/zhtw/jalmile/use/partner_air/oneworld/index.html

#### ANA Mileage Club

Role: Historically important Star Alliance RTW award.

RTW caveat:

- ANA stopped issuing new Star Alliance RTW award tickets as of 2025-06-23.
- Keep it as archived/historical validation only unless rules change.

Source:

- https://www.ana.co.jp/zh/tw/amc/partner-flight-awards/around-the-world/

#### Singapore KrisFlyer

Role: Nearby hub, Star Alliance.

Why it matters:

- Singapore is a practical Southeast Asia hub from Taiwan.
- Useful as a secondary Star Alliance path.

Source:

- https://roundtheworld.staralliance.com/staralliance/en/round-the-world

## Data File

Taiwan market priority lives at:

```text
public/data/markets/tw/current.json
```

This is not a claim of exact market share. It is a product-priority profile for Taiwan-origin RTW planning.

## First Taiwan Implementation Order

1. Taiwan market selector defaults to `TW`.
2. RTW product picker shows Taiwan-priority products first.
3. Add date model for 10+ day minimum trip rules.
4. Add ocean crossing and one-direction validation.
5. Add per-city stopover/open-jaw validation.
6. Add award-zone pricing display for EVA and Asia Miles.
7. Add CI Dynasty Flyer as "not true RTW: Pacific + Atlantic crossing rejected" with a clear explanation.
8. Add JX COSMILE as "watchlist / limited partner award" rather than RTW.
