# Calibration Set — Real Community RTW Routing Threads

**Purpose:** This file is the factual spec behind the Iron Rule test file
`tests/calibration/flyertalk-routings.test.ts`. Each case below is a real,
publicly-verifiable community discussion in which a traveler asked about a
specific multi-leg / round-the-world award itinerary and the community gave
concrete rule-based answers. Failing any pinned test derived from these cases
blocks `/ship` (Success Criterion #2, design doc; Phase-1 debt payoff).

**Relationship to official sources:** Per `docs/rtw-pivot-plan.md`, official
rule pages are the first-class source for rule data (`public/data/rtw-products/*`);
community reports serve as notes and confidence annotations
(`chart-verified` / `community-corrected`). This calibration set is that
community layer: it pins how real routings were actually judged, so the engine
agrees with observed practice instead of just restating brochure rules.

---

## Method & verification limits

- Discovery: web search (general web index + social-media verticals for
  Reddit post/comment retrieval). FlyerTalk, PTT (`points`, `Aviation` boards),
  Reddit (r/awardtravel, r/oneworld, r/QantasFrequentFlyer), and the Point
  Hacks Discourse forum were searched.
- **Sandbox limitation:** this research session could not open pages directly
  (outbound TLS from the shell was blocked), so every quote below is a
  verbatim search-index excerpt, not a full-page transcription. Where the
  excerpt cut off mid-sentence the quote ends with `[…]` and the case is
  marked `PARTIAL`. Before hard-coding expected values into the Iron Rule
  test file, an engineer should spot-check each URL in a normal browser;
  URLs are stable permalinks.
- **Honesty rule:** no case below is fabricated. Cases whose replies could
  not be read are labeled as such. Fewer-but-solid cases were preferred over
  padding with weak ones; near-miss leads are listed separately (§ Near-miss
  leads).
- Dates: PTT permalink timestamps encode the post epoch
  (`M.<unix>.<id>.html`) — those dates are exact. Reddit/FlyerTalk dates come
  from indexed timestamps and may be off by a day (timezone); relative dates
  are marked `≈`.
- Reply counts are included where the index exposed them.

Confidence labels used here (matching the repo's `confidence` field):

| Label | Meaning |
|---|---|
| `chart-verified` | Full thread text (OP + replies) was retrievable at research time. |
| `snippet-verified` | OP and/or reply fragments verified verbatim via index excerpts; full thread not readable from this session (`PARTIAL`). |

---

## Case 1 — Qantas oneworld Classic Flight Reward: does surface distance count? (Point Hacks forum)

**(a) Source**
- URL: https://community.pointhacks.com/t/need-help-with-one-world-classic-flight-reward-melbourne-to-europe-aug-sept-2025/24765
- Forum: Point Hacks Community (Discourse), "Frequent Flyer Programs" board
- Date: thread plans travel Aug/Sep 2025; exact post dates visible on page (not captured in indexed excerpts)
- Status: `chart-verified` (full thread text retrieved)

**(b) OP question / itinerary**
First-time planner asks about a Melbourne → Europe oneworld Classic Flight
Reward (London, Rome, Barcelona, maybe Athens; optional NYC), specifically:

> "Q1: Do I have to go to the Americas in order to qualify for the OWCFR?"
> "Q2: Regarding 'segments' and arranging my own internal travel within europe, does that mean if i took a train from London to Paris, that this distance would be calculated into the 35,000mile limit?"

A later participant posts their actual booked-style chain (mixed cabins,
multiple carriers, two open jaws):

```text
ADL-PER (economy), PER-KUL, KUL-CDG, MXP-HEL, HEL-HND, NRT-HKG, HKG-KUL, KUL-PER, PER-MEL (Economy)
```
(operating carriers not stated in the excerpt; carriers are all oneworld members)

**(c) Community verdicts (verbatim)**

On scope of the product (answers Q1):
> "Qantas OneWorld Round The World redemptions is limited by distance (35000miles) only. You can keep going circles around Asia if you wish."

On surface/open-jaw distance (answers Q2 — the load-bearing verdict):
> "If your itinerary goes XXX-LHR then CDG-YYY, then you have to include the distance between LHR-CDG into the total distance calculated."

On carrier combination:
> "Reads to me like you only need a minimum of 2 non-Qantas oneworld members. I.e. Cathay Pacific and Japan Airlines."

On pricing brackets and the cap:
> "You sure can. There is nothing stopping you from only going upto 19200miles ( the second last distance bracket)."
> "The beauty of the “RTW” itinerary is it caps at 318,000 Qantas pts for business class."
> "You can keep adding flights (at a later stage) to the ***same*** itinerary at a later stage and the point costs will stay at 318,000 pts for business class for distance 19201-35000 miles."

On alliance eligibility:
> "please leave Emirates out of the itinerary as Emirates is not part of the OneWorld alliance."

On change mechanics (secondary, booking-flow rather than routing):
> "Changes will cost 5-6k Qantas points each time." / "Once you take your first flight, you no longer can add flights or change flights on your itinerary."

**(d) gcmp engine rules exercised**
- Product: `qantas-oneworld-classic-flight-reward` (award-rtw / multi-carrier-award kind)
- Distance cap: 35,000 mi — **surface legs' great-circle distance counts toward it**
  (matches `docs/rtw-pivot-plan.md`: "Surface segments are permitted, but surface
  distance counts toward the reward zone calculation")
- Carrier-combination minimum: ≥2 oneworld carriers besides the ticketing carrier
- Distance-bracket pricing: bracket 19,201–35,000 mi → flat cap regardless of added
  flights (see § Conflicts for the 318,000 vs 365,800 discrepancy)
- Alliance membership check: non-oneworld carriers (Emirates) must fail eligibility

---

## Case 2 — Segment-cap conflict: agent says 9 segments, rules say 16 (Reddit r/QantasFrequentFlyer)

**(a) Source**
- URL: https://www.reddit.com/r/QantasFrequentFlyer/comments/1twza5q/one_world_classic_reward_rtw_advice/
- Forum: Reddit r/QantasFrequentFlyer, "One world classic reward (RTW) advice"
- Date: ≈ early 2026 (shown as "2 months ago" at research time); exact date on permalink
- Engagement: 5 upvotes, 18 comments
- Status: `chart-verified` for OP text; `snippet-verified` for comments

**(b) OP question / itinerary**
Business-class RTW on the Qantas oneworld Classic Flight Reward, route shape
"AUS – Asia – Europe – back to Asia" (exact airport chain not posted; OP booked
via the Qantas multi-city tool "to and from Europe" with return legs initially
ending in Asia). Full OP key claims:

> "I've built up enough points for business RTW (365,800 points) and called Qantas to book. […] When booking I clarified whether I could add more segments up to 16 segments at a later point without additional points fee (as hit the cap, but noting there will be a change fee each time) but was told the limit would be 9 segments as it is not deemed a RTW when ticketing. (Route is AUS - Asia - Europe - back to Asia). Is this information correct - from what I've read it will just recalculate as a RTW once I add more flights, up to a max of 16 segments?"

> "I've also been told I need: - one way direction (don't believe required?) - to cross two oceans (don't believe required?) - need to book return to Australia in original ticket (don't believe required but understand total km will deem it a land leg back to original start point?)"

Update edit:
> "Edit 2 […] I've now successfully booked online using the Qantas website multi-city tool to and from Europe (with the return flights just going into Asia currently but enough spend to hit the points cap at 365,800 points)."

**(c) Community verdict(s)**
Retrieved comment fragment supporting the OP over the phone agents:

> "As long as your route and flights meet the Oneworld Classic Flight Reward requirements, the points will cap off at 365,800." `[PARTIAL — comment continues]`

Remaining 17 comments not readable from this session; treat agent-vs-commenter
conflict as unresolved by this set (marked in § Conflicts).

**(d) gcmp engine rules exercised**
- Segment cap: 16 flights for a RTW-classified oneworld Classic Flight Reward;
  the engine must NOT enforce the agent-claimed 9-segment limit for RTW-classified
  itineraries (community consensus side), but this case justifies surfacing a
  `warning` finding when an itinerary is ticketed short-of-RTW then extended.
- Direction / ocean-crossing / start-end: the three agent claims map directly onto
  `geography.directionPolicy`, `requiresAtlanticCrossing`+`requiresPacificCrossing`,
  and `geography.startEnd`; the OP's skepticism plus Case 1's "limited by distance
  only" verdict indicate the Qantas product validates structurally on distance +
  carrier set, unlike cash RTW fares.
- Points cap behavior: price caps at 365,800 (business) once RTW requirements met.

---

## Case 3 — Cathay Asia Miles oneworld Multi-Carrier Award from Taiwan: any First segment prices the whole ticket (PTT points)

**(a) Source**
- URL: https://www.ptt.cc/bbs/points/M.1500623520.A.36A.html
- Forum: PTT 批踢踢實業坊 `points` 板（哩程數板）, "[分享] [AM] 我的寰宇一家頭等艙開票初體驗"
- Author/date: Fri Jul 21 15:51:58 2017 (permalink timestamp, exact)
- Engagement: 61 則留言, 推噓總分 +51 (per pttweb index)
- Status: `snippet-verified` (`PARTIAL` — body beyond index excerpts not readable here)

**(b) OP question / itinerary**
Experience share (not a question): booking an Asia Miles (國泰 Asia Mileage /
"AM") oneworld first-class multi-carrier award after previously booking a Star
Alliance RTW award. Verbatim fragments:

> 「和上次的星空聯盟環球票不同，亞洲萬里通是國泰航空的里程計畫，所屬的聯盟是寰宇一家(簡稱OW)，雖然成員沒有星空聯盟龐大，但裡面好幾家航空公司也是廣為大家所知」

> 「（商務艙則是115000），其中要注意的: 1.只要其中一段是頭等艙的兌換 `[…截斷]`」

The truncated warning list item #1 is the well-known CX multi-carrier rule that
the presence of any First-class sector prices the entire award at the First
chart level (consistent with `docs/rtw-pivot-plan.md`: "Mixed-cabin itinerary
prices at the highest class booked"); verify the sentence tail in-browser before
pinning the exact wording.

Full airport chain was not recoverable from index excerpts. A related share by
the same program/thread family gives the routing flavor (QR/CX via DOH/HKG):

- Follow-up thread: https://www.ptt.cc/bbs/points/M.1526375797.A.BBB.html
  "[分享] [AM] 到底何時改表-寰宇一家頭等艙環球票", May 15 2018:
  > 「那我多找一個回程的頭等總不會那麼心不甘情不願吧？ 本來花時間找了QR的BCN-DOH-HKG或是BCN-DOH-TYO... 嗯，果然死不放票 `[…]`」

**(c) Community verdicts**
- Pricing rule (from OP's 要注意 list): any-F-sector ⇒ whole-ticket First pricing;
  business reference price quoted at 115,000 miles (2017-era AM chart) `[PARTIAL]`.
- Availability verdict (follow-up thread): Qatar Airways effectively never releases
  First award space on BCN–DOH–HKG/TYO candidates —「果然死不放票」— i.e., structural
  validity ≠ bookability (gcmp should report availability `unknown`, per pivot plan
  Product Principle).
- Sample push comments: 「推 abbasmart: 感謝分享!」 (low-signal; confirms engagement only).

**(d) gcmp engine rules exercised**
- Product: `cathay-asia-miles-oneworld-multi-carrier-award`
- Mixed-cabin pricing rule: highest-cabin-wins across sectors
- Carrier-combination: oneworld member set incl. QR; HKG-hub construction TPE-side users actually attempt
- Structural-valid vs bookable separation (availability always `unknown`)
- Rules-version note: 115,000-mile J reference is 2017-chart; do not pin as current price — pin as historical DP under `rv=2017.Q3`

---

## Case 4 — Archived ANA Star Alliance RTW award: distance-band pricing with surface sectors excluded (PTT points)

**(a) Sources** (one primary + three corroborating DPs from the same board/product)
- Primary: https://www.ptt.cc/bbs/points/M.1582274407.A.E4D.html — "[分享] [NH] ANA環球票新手開票心得", Feb 21 2020 (exact), `snippet-verified` (`PARTIAL`)
- Corroboring DPs:
  - https://www.ptt.cc/bbs/points/M.1514818683.A.FA7.html — "[星空] ANA雙人環球商務艙開票心得分享", Jan 1 2018 (exact)
  - https://www.ptt.cc/bbs/points/M.1541163772.A.237.html — "[分享] [NH]星空聯盟環球票開票心得", Nov 2 2018 (exact)
  - https://www.ptt.cc/bbs/points/M.1679034562.A.0FE.html — "[分享] ANA星盟環球票開票經驗分享", Mar 17 2023 (exact) — contains a clean rule transcription

**(b) OP question / itinerary**
Primary post is an experience share: first ANA RTW award for 2 passengers.
Verbatim:

> 「一、使用里程＆稅金：125000*2人，落在20001-22000兌換區間，稅金是1人 `[…截斷]`」

i.e., total itinerary distance fell in the 20,001–22,000 mile band ⇒ 125,000
miles per person. Airport chain not recoverable from excerpts (`PARTIAL`);
corroborating DP gives a concrete total:

> 「航線圖是21949mi 稅金方面比預期中的還要多,已經盡量挑BR.AC `[…截斷]`」 (21,949 mi routed; taxes higher than expected despite preferring BR/AC sectors)

Second corroborating DP (business cabin, ≤22,000 mi):

> 「22000哩的使用12.5萬哩-- ANA環球票囉 `[…]`」

Rule transcription from the Mar 2023 share:

> 「既然發現了新大陸，就認真來看一下ANA的環球哩程票規定吧： - 以全旅程的距離計算所需哩程數（陸地交通區間不列入計算）。 - 可東行或西行，必須跨越 `[…截斷]`」

> 「→ ailniery : 我的路線會從南美洲飛回美國再從美國回亞洲區」

**(c) Community verdicts**
- Band assignment verdict: 21,949 mi ⇒ 20,001–22,000 band ⇒ 125,000 mi/person
  (two independent shares agree on the 12.5萬 figure for that band).
- Surface-sector policy verdict: ground transport sectors are **excluded** from the
  priced distance (「陸地交通區間不列入計算」) — matches pivot-plan historical rule
  "total basic sector mileage, excluding ground transport sectors".
- Carrier-choice affects taxes, not miles:「已經盡量挑BR」— tax optimization via
  operating-carrier selection (BR/EVA preferred), a UI-relevant insight.
- Comment DP: South America → US → Asia return leg ordering accepted within the
  product's direction rules.

**(d) gcmp engine rules exercised**
- Product: `ana-star-alliance-rtw-award` — **status `archived`**: ANA stopped issuing
  new Star Alliance RTW awards 2025-06-23 (pivot plan); all cases here predate that
  and calibrate the archived-validation mode.
- Distance-band pricing: band boundary crossing changes price (test both sides of
  20,001 and 22,001 boundaries around a ~21,949 mi chain).
- Surface-sector accounting policy flag: `excluded-from-distance` for ANA vs
  `counts-toward-distance` for Qantas (Case 1) — the engine must parameterize this
  per product, and this pair of cases pins both branches.
- Ocean-crossing requirement (both oceans once) and east/west direction with no
  backtracking (pivot-plan historical rules) — consistent with all DPs above.

---

## Case 5 — Network-gap feasibility: BR dropped GUM breaks a Taiwan RTW plan; community rebuilds the routing (PTT points Q&A)

**(a) Sources**
- Primary: https://www.ptt.cc/bbs/points/M.1555039889.A.56E.html — "Re: [問題] ANA哩程酬賓機票行程請益開不出來", Apr 12 2019 (exact), `snippet-verified` (`PARTIAL`)
- Follow-up: https://www.ptt.cc/bbs/points/M.1558378277.A.99D.html — same thread, May 21 2019 (exact)

**(b) OP question / itinerary**
Q&A thread: traveler planning a Star Alliance award itinerary out of TPE cannot
get it issued. From the reply fragments, the failing construction involves
reaching Guam via Japan transfer on EVA/Star Alliance, and Europe reach options:

> 「長榮停飛關島,又想加玩日本,去日本轉機怎麼都開不出來?」
> 「2. 土航直飛IST 再轉進歐洲 3. Zone3 `[…]`」
> 「長榮直飛(VIE/CDG/AMS/LHR `[…截斷]`」

Airport-chain reconstruction (marked `PARTIAL`): TPE → (transfer Japan) → GUM
leg impossible because BR ceased TPE–GUM service; Europe alternatives discussed:
BR nonstops to VIE/CDG/AMS/LHR, or TK nonstop TPE–IST then connect into Europe.

Follow-up question pins a concrete carrier/route fact:

> 「最近一直在查TPE-LHR的票也是怎麼都開不出來 很感謝這篇的解釋! 但還是有問題想請問長榮BR67是從TPE-BKK-LHR」

(BR67 operates TPE–BKK–LHR — a fifth-freedom-style two-leg path sold as one flight number.)

**(c) Community verdicts**
- Root cause: network gap, not user error — BR no longer serves GUM, so any
  TPE–Japan–GUM Star Alliance construction fails at eligibility/availability.
- Alternative constructions offered: (1) BR nonstop to VIE/CDG/AMS/LHR then
  onward in Europe; (2) TK nonstop TPE–IST, transfer into Europe;
  (3) workaround「套方式就是改成目的地是日本」— re-anchor the award destination to
  Japan so the remainder issues cleanly.
- Route-shape fact: BR67 = TPE–BKK–LHR; engines must model multi-hop flight
  numbers as two sectors (or one coupon with a technical stop) explicitly.

**(d) gcmp engine rules exercised**
- Eligible-airlines-per-leg check against versioned alliance + route data:
  stale route assumptions (BR–GUM) must produce a fail/warning finding, not silence.
- Suggestion semantics: the three community alternatives are exactly the kind of
  "which leg violates and how should I fix it" outputs the pivot plan requires.
- Sector modeling: flight numbers with intermediate stops (BR67 TPE–BKK–LHR)
  count as separate sectors for segment caps.
- Product context: ANA partner award (pre-discontinuation), Star Alliance set.

---

## Cross-case matrix (what the five cases pin together)

| # | Product | Kind | Rules pinned | Expected engine outcome | Confidence |
|---|---|---|---|---|---|
| 1 | Qantas oneworld Classic Flight Reward | multi-carrier award | 35k mi cap incl. surface GC distance; ≥2 non-ticketing OW carriers; bracket cap pricing; Emirates fails eligibility | valid chain prices at bracket cap; LHR⇢CDG surface adds its distance | chart-verified |
| 2 | Qantas oneworld Classic Flight Reward (RTW-classified) | multi-carrier award | 16-segment RTW cap beats agent-claimed 9; direction/ocean/start-end not structural blockers for this product; cap 365,800 (biz) | 16-seg AUS–Asia–Europe–Asia shape accepted; cap price returned | OP chart-verified / comments snippet-verified |
| 3 | Cathay Asia Miles oneworld Multi-Carrier Award | multi-carrier award | any-First-sector ⇒ whole-ticket First pricing; QR F-space effectively unreleased | mixed-cabin with ≥1 F sector prices entirely as F; availability `unknown` | snippet-verified |
| 4 | ANA Star Alliance RTW award (**archived** 2025-06-23) | award-rtw | 20,001–22,000 mi band ⇒ 125,000/pp (two independent DPs; 21,949 mi DP); surface sectors excluded from priced distance; carrier choice shifts taxes only | band-boundary tests at 20,001/22,001 around a ~21.9k mi chain; surface exclusion branch | snippet-verified |
| 5 | Star Alliance partner award (TPE-origin feasibility) | award-rtw | BR–GUM route absence fails constructions; BR67 TPE–BKK–LHR = two sectors; alternative-hub suggestions (BR EU nonstops, TK IST) | per-leg eligibility findings + fix suggestions match community's three alternatives | snippet-verified |

Rules-version drift demonstrated inside the set (supports `rv=YYYY.Q` snapshots):
- Qantas business cap: **318,000 pts** (Point Hacks thread, pre-Aug-2025 chart) vs
  **365,800 pts** (Reddit OP + Finder/AFF, post-2025-08-05 chart revision per
  australianfrequentflyer.com). Same rule, different snapshot — pin per-rv values,
  never one global constant.
- CX multi-carrier caps changed Oct 2023 (see near-miss FT 2137901): max 5
  stopovers / 2 transfers / 2 open-jaws, plus a no-transit-through-HKG-start rule.
- AM J reference price 115,000 (Case 3) is 2017-chart only.

## Conflicts found (do NOT silently resolve)

1. **9 vs 16 segments (Case 2):** phone agents repeatedly claimed 9; OP + commenter
   side with the published RTW classification. Engine pins 16-with-warning; the doc
   records the conflict because real users hit it.
2. **318,000 vs 365,800 business cap:** resolved as chart-version drift (above),
   not a disagreement about rules.
3. **Surface-distance policy:** Qantas counts surface GC distance toward the cap
   (Case 1); ANA excludes ground sectors from priced distance (Case 4). Both are
   correct — per-product parameterization, not a bug.

## Near-miss leads (real threads, not activated as cases)

These had partial verification only; kept as future case candidates or for
manual browser transcription:

- FT "Oneworld multi-carrier award open jaw counted as miles" (Jan 25 2025) —
  https://www.flyertalk.com/forum/cathay-pacific-cathay/2184572-oneworld-multi-carrier-award-open-jaw-counted-miles.html —
  OP: 「JFK-LHR-HKG-TPE-KUL-BKK // SIN-HKG-JFK, which should priced at 230,000 miles
  with flying distance `[…]`」 — complete chain + expected price; replies unreadable
  from this session (`PARTIAL`). Best single upgrade candidate for Case 3.
- FT "BIG ISSUE - Asiamiles Oneworld ticket rules change??? Immediate effect???"
  (Oct 9 2023) — https://www.flyertalk.com/forum/cathay-pacific-cathay/2137901-big-issue-asiamiles-oneworld-ticket-rules-change-immediate-effect.html —
  quotes new CX multi-carrier caps: "maximum of five stopovers. In addition, two
  transfers and two open-jaws are permitted"; and "if you start the ticket in HKG,
  you can't pass through HKG anymore, then the Three long hauls tickets will no
  longer be issue-able?" Companion tool thread: FT 2127654 "[Release] oneworld
  Multicarrier Award Planner" (Jul 7 2023) states the same caps.
- FT "RTW or a bunch of one ways??" (oneworld, Mar 3 2024) —
  https://www.flyertalk.com/forum/oneworld/2153563-rtw-bunch-one-ways.html —
  OP wants all-J EU→HNL(+family stop)→…; reply verdict: "The rules for the
  Oneworld Explorer state that a minimum of two stopovers have to take place
  (stopover = 24h+) so your plan would fit into that `[…]`" — best available
  oneworld Explorer community verdict; itinerary chain incomplete.
- Reddit r/oneworld "RTW Explorer" — https://www.reddit.com/r/oneworld/comments/1rjcoil/rtw_explorer/ —
  westbound LAX business Explorer quote "$12,500 USD"; commenter counter-DP:
  "I've just built a 4 continent basic RTW itinerary (including Australia) from
  LAX for approximately $7,500 USD per person". Pricing sanity-check DP, not a
  rule verdict.
- PTT Aviation "[分享] 星空聯盟- 商務艙環球票" (Sep 28 2025) —
  https://www.ptt.cc/bbs/Aviation/M.1759034817.A.029.html — recent Taiwan
  business-class Star Alliance RTW share; considered EVA BR190 Royal Laurel
  (「本來要考慮長榮的BR190,有皇璽桂冠艙可以搭」), routed e.g. 9/11 HND✈ORD (NH112).
  Strongest known lead for an EVA-flavored *A RTW case; body only partially indexed.
- PTT points extra DPs: ANA RTW 115,000×2 share (Nov 16 2017,
  M.1510843681.A.494); first-RTW share (Jul 25 2023, M.1690270898.A.4EC);
  JAL oneworld RTW rules share (Apr 4 2023, M.1680619669.A.BFD):
  「日航環球票的規則: -10001~12000哩商務艙 ・ 全行程最多包含:8 ・ 行程『可以』是單程機票,
  出發地及目的地可以是『不同國家及地區』」 — useful contrast: start/end `open` policy
  exists in the wild (vs same-city/country products).

## Coverage gaps (explicit, per honesty rule)

- **EVA Infinity Star Alliance World Travel Award:** no dedicated public thread
  with a concrete WT-award itinerary AND community rule verdicts was found in
  this pass. Official parameters exist (evaair.com Star Alliance award page:
  Around-the-World award 180,000 / 325,000 / 480,000 miles in Y/J/F, max 10
  sectors, max 7 stopovers, >10 days, no repeated departure city) and the PTT
  Aviation Sep-2025 lead above shows Taiwan users circling the product — but no
  verdict-rich thread surfaced. Do not fabricate a fifth-product case; when a
  browser-capable session is available, search FT EVA Air forum + PTT for
  「寰宇」/「環球獎勵機票 長榮」 again.
- **oneworld Explorer (cash fare):** only the FT 2153563 min-two-stopover verdict
  fragment (near-miss list). Continent-pricing verdicts remain unpinned by this set.

## Official anchors (context only — not community calibration)

- oneworld Explorer rules (forward direction between zones, backtrack within
  continent generally OK, same-city start/finish, cross Atlantic+Pacific, 3–16
  flights, 10 days–1 yr): https://www.oneworld.com/round-the-world
- Star Alliance RTW fare (same-country start/end, one global direction, both
  oceans, max 16 coupons): https://www.staralliance.com/en/round-the-world
- EVA Infinity Star Alliance awards incl. Around-the-World award params:
  https://www.evaair.com/en-us/infinity-mileage-lands/mileage-award-program/mileage-redemption/award-ticket/star-alliance/
- ANA RTW award discontinuation notice (2025-06-23) and historical rules: see
  `docs/rtw-pivot-plan.md` § ANA Star Alliance RTW Award.

---

*Suggested Iron Rule test ids (for the engineer activating
`tests/calibration/flyertalk-routings.test.ts.template`):*
`calib.qf-owcfr.surface-distance-counts`, `calib.qf-owcfr.segment-cap-16-not-9`,
`calib.cx-multicarrier.any-first-prices-as-first`,
`calib.ana-rtw-archived.band-20001-22000-is-125k` +
`calib.ana-rtw-archived.surface-excluded-from-distance`,
`calib.sta-eligibility.br-gum-gap-and-br67-two-sectors`.

---

## Addendum — Phase-4 research pass (2026-08): Case-3 pricing pin upgrade + BR network-gap data proposal

This addendum appends evidence gathered in a later research session with working
outbound HTTP. It (A1) upgrades Cases 3/5 sources from search-index snippets to
full-text retrieval and pins official wording for the CX any-First pricing rule,
and (A2) verifies the BR Guam route history and proposes the data mechanism for
the network-gap warning (`calib.sta-eligibility.br-gum-network-gap-warns`).
Nothing above this section is modified. Confidence labels follow § Method &
verification limits; quotes captured verbatim from live pages or Wayback
captures this pass are marked `fetched-verbatim` (stronger than index excerpts;
pages only partially extracted stay `PARTIAL`).

### A1 — Case 3 upgrade: the any-First ⇒ whole-ticket-First rule is officially worded; three price DPs pinned

**(a) Sources**

- Official T&C, pre-Oct-2023 wording — Wayback capture 2019-03-06 of the Asia
  Miles EN site:
  https://web.archive.org/web/20190306081345/https://www.asiamiles.com/en/terms-and-conditions/service/flight-award-oneworld-multi-carrier-awards.html
  — `chart-verified` (`fetched-verbatim`)
- Official T&C, post-Oct-2023 wording, as transcribed into FT 2137901 by
  percysmith (Oct 9 2023) quoting cathaypacific.com:
  https://www.flyertalk.com/forum/cathay-pacific-cathay/2137901-big-issue-asiamiles-oneworld-ticket-rules-change-immediate-effect.html
  — posts #1–#3 `fetched-verbatim`; post #4 tail truncated (`PARTIAL`)
- PTT Case-3 primary (§Case 3): full text retrieved this pass — status upgrades
  from `snippet-verified`/`PARTIAL` to `chart-verified`
- PTT follow-up (May 15 2018): full text retrieved — `chart-verified`
- FlyerTalk 2184572 (listed above as near-miss lead; now read):
  https://www.flyertalk.com/forum/cathay-pacific-cathay/2184572-oneworld-multi-carrier-award-open-jaw-counted-miles.html
  — OP + sole reply `fetched-verbatim`

**(b) Verbatim evidence**

Official rule text, 2019-03-06 capture (rv≈2019.Q1; both PTT threads show no
chart change reported 2017→2018, so this wording covers the 2017.Q3-era DPs):

> "For multiple-sector Flight Awards, the Mileage Credits required are those of
> the highest class booked in any single itinerary."

Same clause in the Oct-2023 revision (program currency renamed Mileage Credits →
Asia Miles):

> "For multiple-sector Flight Awards, the Asia Miles required to redeem such
> Flight Award are those of the highest class booked in any single itinerary."

Also official, both eras (pin per-rv; 2019 wording shown):

> "A one world Multi-carrier Award is applicable for: two one world alliance
> airlines, when Cathay Pacific or Cathay Dragon is not one of your selected
> carriers; or three or more one world alliance airlines, when Cathay Pacific or
> Cathay Dragon is one of your selected carriers."

> "The maximum distance range is up to 50,000 miles."

> "To redeem a one world Multi-carrier Award, the total Mileage Credits required
> to determine the award zone is the sum of the sector distance (between the
> origin airports and destination airports) of all sectors in the itinerary."

> "The Member or Nominee can make a maximum of five stopovers. In addition, two
> transfers and two open-jaws are permitted."

> "A one world Multi-carrier Award does not offer travelling on Premium Economy
> Class."

Oct-2023 additionally added the HKG-start anti-backtrack clause: "Stopover/Open-
jaw is permitted once for one city in the itinerary, and cannot be the same city
of the point of origin or point of destination."

PTT Jul 21 2017 (koki0331) — rule + band pair as experienced:

> 「一開始設定的目標是獎勵區域08，頭等艙所需里程是155000(商務艙則是115000)，其中要注意的: 1.只要其中一段是頭等艙的兌換機票，就會以較高的標準計算」

> 「可以發現距離約是14329，已經超過14000了，這樣所需里程會瞬間從155000跳到190000，太不划算」

> 「3.旅程中最多可以五次停留+兩次轉機」

Issued itinerary: TSA-HND JL C / HND-LHR JL F / LHR-CDG BA C / ZRH-HKG CX F /
HKG-TPE CX C — total **155,000 miles + 2,182 HKD tax**.

PTT May 15 2018 (Masumi) — J↔F pairing at the next band up + fee schedule:

> 「但現在我要開的是頭等艙，等於上面的部分會一口氣從140000里程暴增成190000里程」

(business 140,000 ↔ First 190,000 on her longer chain — consistent with
koki0331's F jump). Issued ticket: HKG-TPE CX C（開口）/ HND-LHR JL F（停）/
LHR-LIS BA C（開口）/ FRA-HKG CX F = **155,000 mi, 2,750 HKD**. Fee DP:
「改期：單純更改日期時間…每段收40美金或4000哩」「重簽：改艙等或追加航段時使用…整張收
100美金或10000哩」「退票：…整張收120美金或12000哩」. QR First availability:
「本來花時間找了QR的BCN-DOH-HKG或是BCN-DOH-TYO...嗯，果然死不放票XD」.

FT Jan 25 2025 (OP GherkinFT; jagmeets reply) — open-jaw counting + third price DP:

> "JFK-LHR-HKG-TPE-KUL-BKK // SIN-HKG-JFK, which should priced at 230,000 miles
> with flying distance of 19,442 miles. However, Asia miles agent said the
> system showed I'm in the 20,000-25,000 range.. It seemed it might have added
> the open jaw BKK//SIN as flight distance."

> "Seems correct?" (jagmeets — senior CX-forum member endorsing the agent's
> open-jaw-inclusive zoning)

**(c) What this pins for the engine**

- Mechanism `any-First-sector ⇒ whole-ticket prices as First`: **officially
  confirmed** by the highest-class-booked clause in both eras — the blocked
  TODO `calib.cx-multicarrier.any-first-prices-as-first` is unblocked at
  mechanism level.
- Band boundary: {F 155,000 / J 115,000} vs next band {F 190,000 / J 140,000}
  separated at **14,000 mi** (a 14,329-mi plan crossed it upward; both ≤14,000-mi
  issued tickets priced 155,000).
- Zone total includes open-jaw/surface great-circle distance: official "sum of
  the sector distance of all sectors" + the FT agent DP zoning an open-jawed
  19,442-flying-mi ticket into 20,001–25,000.
- Third price DP: 19,442 flying mi ⇒ 230,000 miles (cabin NOT stated in OP — do
  not assume First or Business).
- Carrier minimums, no-Premium-Economy, 5 stopovers / 2 transfers / 2 open-jaws,
  50,000-mile ceiling: all official text; the Oct-2023 revision changes wording
  and adds the HKG-start clause — snapshot per-rv.

**(d) Honesty note — what is still NOT pinned**

The complete per-band Y/J/F table was **not recovered**. The T&C pages carry
rules but no chart; Wayback CDX over asiamiles.com
(oneworld/multi-carrier/chart/redeem/flight-award URL patterns) surfaced only
T&C pages and images; the FT "[Release] oneworld Multicarrier Award Planner"
(thread 2127654) has zero Wayback captures; general web search was degraded
during this pass (search-API auth outage; DDG/Bing bot walls). Per the honesty
rule: **do not fabricate the missing bands.** Recommendation: keep the TODO open
but narrow it to "transcribe full band table from an archived award-chart page
(browser pass)", and activate NOW the sub-tests that ARE evidenced:
highest-class-wins mechanism; the 14,000-mi boundary pair {155k/115k |
190k/140k} (values `community-corrected`); open-jaw-distance-counts;
carrier-minimum; no-PE (official clauses `chart-verified`).

### A2 — BR network gap: verified route facts + proposed data mechanism

**(a) Sources** (all `fetched-verbatim` unless noted)

- FT 1838853 (Apr 25 2017):
  https://www.flyertalk.com/forum/eva-air-infinity-mileageLands/1838853-eva-end-guam-surabaya.html
- postguam.com (Mar 2017):
  https://www.postguam.com/news/local/eva-air-pulling-out-of-guam/article_7cdd8b00-2a66-11e7-b21c-4bce1748b3e3.html
  — search-index excerpt (`snippet-verified`, `PARTIAL`)
- farebuzz (c. 2017):
  https://www.farebuzz.com/updates/eva-air-ends-twice-weekly-direct-taipei-guam-flights.aspx
  — search-index excerpt (`snippet-verified`, `PARTIAL`)
- Wikipedia `List of EVA Air destinations`, rev 2022-04-09
  (oldid=1081772131, read via Wayback render): Guam row = "Terminated",
  citing "EVA Air cancels Guam service from June 2017", Routesonline,
  25 Apr 2017 (the Routesonline article itself was not retrievable this pass —
  cite via the Wikipedia reference)
- AeroRoutes (published 1000GMT 13 Dec 2024):
  https://www.aeroroutes.com/eng/241213-uans25gumtpe
- EVA official route-map pages (future snapshot source):
  https://www.evaair.com/en-us/plan-and-book/where-we-fly/route-maps/long-haul-route-map/
- PTT threads of §Case 5 — full text retrieved this pass (status upgrade to
  `chart-verified`)

**(b) Verified timeline**

- Launch: **2011** — farebuzz: "EVA Air had first launched its flights to Guam
  in 2011."
- End: effective **10JUN17**, twice-weekly TPE–GUM — FT OP (coolfish1103):
  "EVA to end services to Guam from 10JUN17. Also, it's ending services to
  Surabaya from 29OCT17, currently zeroing out services from 02SEP17. CAL
  continues to service both destinations, with Surabaya having a one-stop at
  Singapore." postguam: "its last date for the Guam route is June 7" — minor
  discrepancy (last departure vs schedule end; twice-weekly); Wikipedia/
  Routesonline say "from June 2017". Record all three; treat 10JUN17 as the
  schedule-effective date.
- Community color: hayzel7773: "not surprised at all. The two routes that have
  constantly been changing freq and aircraft for BR. Total money losers too.";
  bzcat: "Seems like BR has struggled with a lot of leisure focused intra-Asia
  routes."
- Alternatives: CAL continues TPE–GUM ("China Airlines will now be the only
  Taiwanese carrier to continue serving Guam from Taipei"); UA resumed
  GUM–TPE **02APR25** twice-weekly 737-800 (UA165 GUM0700–0925TPE, UA166
  TPE1030–1620GUM / TPE1100–1650GUM), having "last served on regular scheduled
  basis until 2005 with Continental Micronesia" (AeroRoutes). So 2005→2025 the
  only Taiwan-link was CI.
- Adjacent gap DP from §Case 5 pushes: scrazy77 「上海飛關島UA已經停飛了」
  (UA PVG–GUM also discontinued by Apr 2019).

**(c) Proposed data mechanism (feeds `calib.sta-eligibility.br-gum-network-gap-warns`)**

Option 1 — **Network-gap watchlist (recommended now)**: static, versioned,
zod-validated file `public/data/network-gaps/{carrier}/v{YYYY.Q}.json`, same
conventions as program data. Entry shape:

```json
{
  "carrier": "BR", "pair": ["TPE", "GUM"], "status": "not-flown",
  "since": "2017-06", "until": null, "action": "warn",
  "confidence": "chart-verified",
  "evidence": [
    "https://www.flyertalk.com/forum/eva-air-infinity-mileagelands/1838853-eva-end-guam-surabaya.html",
    "https://www.postguam.com/news/local/eva-air-pulling-out-of-guam/article_7cdd8b00-2a66-11e7-b21c-4bce1748b3e3.html"
  ]
}
```

Engine emits a `warning` finding when an operating-carrier × city-pair matches
an entry ("BR does not operate TPE–GUM (ceased 2017-06); consider CI or UA").
Pros: tiny; every entry evidence-linked; honest about scope; reuses existing
zod + rv-snapshot machinery; directly activates the calibration test. Cons:
incomplete by construction (only pairs someone actually assumed); needs
periodic recheck each rv; entries can go stale if a route resumes — hence the
`until` field (e.g., a UA TPE–GUM entry would carry `since:"2005"`,
`until:"2025-04"`).

Option 2 — **Full operated-network snapshot (later)**: scrape evaair.com route
maps into a positive set `data/network/{carrier}/v{YYYY.Q}.json`; warn on any
requested pair absent from the set. Pros: complete coverage; catches unknown
gaps generically. Cons: marketing route maps are JS surfaces → fragile scrapes;
route churn (seasonal cuts, resumptions like UA GUM–TPE 2025-04) produces false
warnings without careful dating; larger schema/CI burden; attribution questions.

Recommendation: ship Option 1 seeded with BR TPE–GUM (optionally UA PVG–GUM per
scrazy77, and UA TPE–GUM as a closed-gap entry so tests pin both branches);
keep the schema forward-compatible so a future Option-2 snapshot can subsume
the watchlist as override annotations. Emit `warning`, not `fail`: Case 5 shows
the same city-pair assumption can be structurally valid under other
constructions, and eligibility depends on the ticketing product's partner rules.

**(d) New conflict to record (do NOT silently resolve) — co-terminal /
technical-stop flight numbers**

§Case 5(d) says multi-hop flight numbers (BR67 TPE–BKK–LHR) "count as separate
sectors for segment caps". Full-text evidence adds the ANA zone-arithmetic
view: howlic 「Co-terminal flight是視同直飛航班 BR61 不能拆開來看」; jimsun
「中停曼谷如果是直接開tpe-lhr(ams,vie)可以，視為直飛」; lightring demonstrates
ANA prices BR61-style chains as a 1-stop direct. Both views can hold
simultaneously: physically two sectors for segment-cap accounting, one
"direct" for zone-distance arithmetic. Parameterize per rule context; record
as conflict #4 beside § Conflicts found. Bonus availability DP: kinbon asked
whether BR67 ever releases business award space — tinystudio:
「幾乎不沒放，這段票我查了好幾年印象中只看過1,2次」 (structural-valid ≠ bookable,
again).

### A3 — Band-table archaeology round 2 (follow-up pass)

Follow-up exhausting the two leads left open by A1(d): archived chart-page
images, and the unswept oneworld.com / cathaypacific.com domains. Outcome:
**positive** — the complete official band table was recovered from a
server-rendered Wayback capture; no image OCR was needed.

**(a) Primary source — full official chart, rv=2018.Q2**

Wayback capture **20180528013013** (2018-05-28 01:30:13 UTC, status 200) of
`https://www.asiamiles.com/en/redeem-awards/flight-awards/flight-award-chart.html`,
fetched verbatim via shell HTTPS
(`https://web.archive.org/web/20180528013013id_/https://www.asiamiles.com/en/redeem-awards/flight-awards/flight-award-chart.html`,
75,650 bytes; local cache `%TEMP%\gcmp-research\am-flight-award-chart-2018.html`).
The table is server-rendered HTML (values present in raw markup, not
JS-injected), so every number below carries **`chart-verified`** confidence —
this is the official published chart itself, not a community reconstruction.
Product identity proven by the intro directly above the table (verbatim):

> Refer to this chart to check if you are redeeming a round-trip award ticket
> with an itinerary which covers: Two one world alliance airlines, which Cathay
> Pacific or Cathay Dragon is not one of your selected carriers; or Three or
> more one world alliance airlines, which Cathay Pacific or Cathay Dragon is
> one of your selected carriers. You can choose from all one world alliance
> airlines in your journey, with a maximum distance of 50,000 miles.

Column headers verbatim: "Award zone / Distance in actual miles / Required
miles Economy Class / Business Class / First Class".

```
zone | actual flown miles | Economy | Business | First
 01  |        0 -    1,000|  30,000 |   55,000 |  70,000
 02  |    1,001 -  1,500  |  30,000 |   60,000 |  80,000
 03  |    1,501 -  2,000  |  35,000 |   65,000 |  90,000
 04  |    2,001 -  4,000  |  35,000 |   70,000 |  95,000
 05  |    4,001 -  7,500  |  60,000 |   80,000 | 105,000
 06  |    7,501 -  9,000  |  60,000 |   85,000 | 115,000
 07  |    9,001 - 10,000  |  65,000 |   95,000 | 130,000
 08  |   10,001 - 14,000  |  85,000 |  115,000 | 155,000
 09  |   14,001 - 18,000  |  90,000 |  135,000 | 190,000
 10  |   18,001 - 20,000  |  95,000 |  140,000 | 205,000
 11  |   20,001 - 25,000  | 110,000 |  160,000 | 235,000
 12  |   25,001 - 35,000  | 130,000 |  190,000 | 275,000
 13  |   35,001 - 50,000  | 150,000 |  220,000 | 335,000
```

Same-page general conditions (verbatim): "The awards zone is determined by the
actual miles flown in all of the sectors of your itinerary. You can make a
maximum of five stopovers, two transfers and two open-jaws at either origin,
en-route or turnaround point, subject to airline partners' terms and
conditions." plus fee thresholds "HKD50 or more" (government/airport) and
"HKD193 or more" (carrier-imposed) — corroborating A1(b)'s T&C text and the
50,000-mile ceiling.

rv pinning: capture date 2018-05-28 → snapshot as **rv=2018.Q2**. Zone 08 is
additionally corroborated by koki0331's Jul-2017 thread (identical
{E85,000/J115,000/F155,000}), so row 08 is stable across rv=2017.Q3–2018.Q2;
no evidence of any revision between those dates.

Cross-validation against §A1 DPs (all exact matches):

- koki0331 zone-08 pair {F 155,000 / J 115,000} → row 08 exact.
- koki0331 boundary jump: 14,329-mi plan ⇒ 「所需里程會瞬間從155000跳到190000」
  → row 09 First = 190,000 exact.
- Masumi issued ticket (≈13.2k mi chain, paid 155,000) → row 08 First exact.
- Masumi merged-chain projection (≈17.5–17.9k mi ⇒ 190,000 all-premium) → row 09
  First = 190,000 exact.

**(b) Correction the chart forces — record, do NOT silently resolve**

§A1(c) currently states the band boundary pair as {F 155,000 / J 115,000} vs
next band **{F 190,000 / J 140,000}**. The official chart splits that pairing
across TWO rows: row 09 = {J 135,000 / F 190,000}, row 10 = {J 140,000 /
F 205,000}. Masumi's 「一口氣從140000里程暴增成190000里程」 therefore cannot hold
within a single row of this chart. Two readings: (i) her chain sat in row 09
(like koki0331's 14,329-mi case) — then J was 135,000 and her "140000" figure
is imprecise or reflects an earlier chart revision; (ii) her chain sat in row
10 — then J=140,000 holds but First would be 205,000, not 190,000. koki0331's
exact F-jump DP anchors row 09 just past 14,000, favoring reading (i), but this
stays **unresolved** — treat as conflict material beside §A2(d), and prefer
chart rows over the community-paired {190,000/140,000} couplet when pinning
engine bands.

**(c) Rules-drift confirmation**

The FT Jan-2025 DP (19,442 flying mi ⇒ agent-zoned into 20,001–25,000, OP
expected 230,000) matches **no** cell of this 2018 table (nearest: row 10
First 205,000; row 11 First 235,000 / Business 160,000 / Economy 110,000) ⇒
the multi-carrier chart was revised after 2018-05, arithmetically consistent
with the Oct-2023 T&C revision quoted in A1(b). Do NOT reuse rv=2018.Q2 rows
for late-rv tests. Untranscribed candidate captures of later eras seen in CDX
of the same URL: 20210615190855, 20240210095453, 20240903150154 — natural
follow-up target for a late-rv pin (out of this pass's time-box).

**(d) Negative results — leads checked and closed**

- Wayback CDX image sweep over asiamiles.com (`mimetype:image/*` +
  award/oneworld/chart URL filters, all eras): nav chrome, thumbnails, lifestyle
  banners only; zero data-table images. `pic_awardchart_oneworld.gif`
  (2002–2004 captures) is a category icon, not a chart. The saved 2019-03-06 EN
  T&C snapshot contains no chart img/href either (content JS-injected).
- oneworld.com CDX sweep (`url=oneworld.com*`,
  `filter=original:.*multi.?carrier.*`, collapse urlkey): zero matching
  captures — clean negative.
- cathaypacific.com CDX sweep (same filter): HTTP 504 Gateway Timeout twice —
  infrastructure failure, NOT evidence of absence; deliberately unexhausted
  (low value now that (a) succeeded).
- Search engines degraded all session (search-API HTTP 402 auth outage; DDG
  bot-wall; Bing RSS junk) — irrelevant once CDX URL-pattern archaeology
  located the page directly.

Disposition: the A1(d) honesty-note TODO ("complete per-band Y/J/F table not
recovered") is hereby **resolved for rv=2018.Q2**; the "Keep TODO (narrowed)"
bullet in the suggested-test-ids list below predates this pass and is left
untouched (append-only) — superseded on commit. Bonus leads in the same
capture (untranscribed): the page also hosts the "Asia Miles awards chart"
(CX own-flight zones S–F, incl. Premium Economy rows) and an "Airline partners
awards chart" (single-carrier partner awards incl. non-oneworld partners such
as BR) — future calibration targets at the same URL/timestamp.

### A4 — Early-rv chart check (follow-up pass 2)

Question: does a **pre-2018-05** Wayback capture exist of
`https://www.asiamiles.com/en/redeem-awards/flight-awards/flight-award-chart.html`
(or earlier URL variants)? A 2017-era official table would adjudicate the
Masumi 「140000」 conflict toward one era; its absence keeps it open.

**(a) Negative result — no pre-2018-05 capture exists**

- Uncollapsed CDX over the exact canonical URL (www and bare host, all
  captures, no urlkey collapse): the **first-ever capture is 20180528013013**
  (the §A3 source itself); next is 20180819154942; dense re-crawling only from
  2020 onward. Nothing earlier exists.
- Domain-wide CDX pattern `original:.*flight.?award.?chart.*` (collapse
  urlkey): earliest hit remains 20180528013013; regional variants first appear
  ≥2019-07 (zh 20190722210600, ja 20190818193429, sc 20191023233801,
  ko 20210422132949); suffix-junk URLs (%20…, /1000, #…) are all ≥2021.
- Pattern `original:.*multi.?carrier.*`: T&C pages only (earliest
  20190306081345 — the §A1(b) snapshot), no chart page.
- Old-era chart URLs (2005–2012, recorded during the A3 pass) predate the
  multi-carrier product.

⇒ Task outcome (c): the archive cannot date any band value earlier than
2018-05-28. Jul-2017 pricing knowledge stays community-only (koki0331's row-08
pair + F-jump DPs). The Masumi conflict remains honestly unresolved — under
BOTH recovered official eras no single row pairs {J140k / F190k} (2018-05:
J140k is row 10, F190k is row 09; 2018-08: neither value appears anywhere).

**(b) Bonus positive within fetch budget — second official snapshot
(post-revision)**

Capture **20180819154942** (2018-08-19 UTC, status 200, 69,306 bytes, fetched
verbatim via `…/web/20180819154942id_/…`; cache
`%TEMP%\gcmp-research\am-flight-award-chart-2018-08.html`). Same page identity:
section now titled verbatim "one world Multi-Carrier Award Chart" (May era:
"one world Multi-carrier Awards chart"), identical intro sentence (two-oneworld-
airlines / three-or-more conditions, 50,000-mile maximum), identical column
headers. Full server-rendered table, per-cell **`chart-verified`**, pinned
rv=**2018.Q3**:

```
zone | actual flown miles | Economy | Business | First
 01  |        0 -    1,000|  30,000 |   55,000 |  70,000
 02  |    1,001 -  1,500  |  30,000 |   60,000 |  80,000
 03  |    1,501 -  2,000  |  35,000 |   65,000 |  90,000
 04  |    2,001 -  4,000  |  35,000 |   70,000 |  95,000
 05  |    4,001 -  7,500  |  60,000 |   90,000 | 140,000
 06  |    7,501 -  9,000  |  65,000 |  100,000 | 150,000
 07  |    9,001 - 10,000  |  70,000 |  110,000 | 160,000
 08  |   10,001 - 14,000  |  90,000 |  135,000 | 220,000
 09  |   14,001 - 18,000  | 100,000 |  155,000 | 250,000
 10  |   18,001 - 20,000  | 105,000 |  165,000 | 260,000
 11  |   20,001 - 25,000  | 115,000 |  185,000 | 280,000
 12  |   25,001 - 35,000  | 130,000 |  210,000 | 300,000
 13  |   35,001 - 50,000  | 150,000 |  240,000 | 345,000
```

Deltas vs the 2018-05-28 table (§A3(a)): rows 01–04 identical; row 05 J +10k /
F +35k; rows 06–07 J +15k / F +30–35k; row 08 J +20k / **F +65k (155k→220k)**;
row 09 J +20k / **F +60k (190k→250k)**; row 10 J +25k / F +55k; row 11 J +25k /
F +45k; row 12 E unchanged / J +20k / F +25k; row 13 E unchanged / J +20k /
F +10k. The multi-carrier chart therefore has at least two distinct official
eras — [.., 2018-05-28] and [2018-08-19, ..] values — with the revision
bracketed strictly inside (2018-05-28, 2018-08-19); neither page states an
effective date, so only the bracket may be asserted.

Engine notes:

- The t4 rv=2017.Q3 boundary fixture's First-side numbers (F155 @≤14,000;
  F190 just past 14,000) match the MAY-era table, whose zone-08 row is
  identical to koki0331's Jul-2017 DP — i.e., May-2018 values are the direct
  continuation of the Jul-2017 community era. The Aug-2018 table breaks that
  continuity: any future test touching ≥4,001-mi bands must be rv-scoped
  (row 09 First is 190,000 pre-revision vs 250,000 post).
- FT Jan-2025 DP (19,442 mi ⇒ agent-zoned into 20,001–25,000; expected
  230,000) matches no cell of EITHER recovered era (Aug row 10 = 105/165/260,
  row 11 = 115/185/280) ⇒ at least one further revision post-Aug-2018;
  §A3(c)'s late-rv capture candidates (20210615190855, 20240210095453,
  20240903150154) remain unpinned follow-up targets.
- Time-box honored: one CDX sweep (four batched queries), one fetch of the two
  allowed (the Aug capture); the second stayed unused.

### A5 — Late-rv chart check (follow-up pass 3)

Question (consumes the §A3(c)/§A4 unpinned follow-up targets): what do Wayback
captures 20210615190855, 20240210095453, 20240903150154 of
`https://www.asiamiles.com/en/redeem-awards/flight-awards/flight-award-chart.html`
contain, and do they explain FT 2184572's Jan-2025 data point (~230,000 miles,
agent-zoned into the "20,000-25,000 range", cabin UNSTATED)?

**(a) Target resolution — what the three timestamps actually are**

Uncollapsed CDX sweep over the canonical URL (ONE batched call,
`fl=timestamp,original,statuscode,mimetype,length`; cache
`%TEMP%\gcmp-research\cdx-a5-sweep.json`): 102 rows = 53×status 200 +
47×302 + 1×301 + 1×status `-`. Distinct originals: 98× the exact
`https://www.…flight-award-chart.html` plus bare-host http variants and two
`#fragment` URLs. Status timeline: 200s run 20180528013013 → **20230226074714
(last 200)**; first redirect stub 20220509070442 (bare-host 301, transient);
permanent-302 era from **20230822012314** through 20251206… (~715-byte `unk`
records). None of the three §A3(c) timestamps exists as a capture row of this
URL — at replay time Wayback resolves each to its nearest usable record:

- 20210615190855 → capture **20210615191353** of the same URL (200,
  text/html, 110,899 bytes raw).
- 20240210095453 → replay follows the archived **302**: the old URL had become
  a redirect to
  `https://flights.cathaypacific.com/en_HK/redeem-flights/flight-award-chart.html`,
  landing at capture **20231205064759** (200, 13,420 bytes).
- 20240903150154 → likewise → capture **20241105050705** (200, 14,641 bytes).

I.e. the page migrated to flights.cathaypacific.com inside
(2023-02-26, 2023-08-22], consistent with FT 2137901's Oct-2023 rules overhaul
window.

**(b) Per-capture verdicts**

- **20210615190855 (= capture 20210615191353): POSITIVE** — full
  server-rendered multi-carrier table; same product-intro paragraph and column
  headers as §A3(a); cache `%TEMP%\gcmp-research\am-chart-2021-06.html`.
  Pinned **rv=2021.Q2**; full table in (c).
- **20240210095453 (= cathay capture 20231205064759): NEGATIVE** — JS SPA
  shell, 13,420 bytes. Exact evidence: visible text is the title "Flight
  awards charts" only; zero mileage-like numbers (`\d{2,3},\d{3}` matches:
  none); no `application/json`/`ld+json` script tags; only `window.BOOMR*`
  analytics assignments and ~25 hreflang alternates. Cache
  `am-chart-2024-02.html`.
- **20240903150154 (= cathay capture 20241105050705): NEGATIVE** — same shell
  shape, 14,641 bytes, same probes empty. Cache `am-chart-2024-09.html`.

**(c) Third official era pinned — chart frozen 2018-08-19 → ≥2023-02-26**

Bonus fetch (final page-fetch slot): capture **20230226074714** (200,
112,247 bytes; cache `am-chart-2023-02.html`) — the LAST server-rendered
state of the original URL, pinned **rv=2023.Q1**. Its multi-carrier table and
the rv=2021.Q2 table above are row-for-row identical to §A4(b)'s rv=2018.Q3
across all 39 cells (per-cell **`chart-verified`**, complete transcriptions;
local stripped-text caches `am-chart-2021-06.txt`, `am-chart-2023-02.txt`):

```
zone | actual flown miles | Economy | Business | First     (rv=2021.Q2 ==
 01  |        0 -    1,000|  30,000 |   55,000 |  70,000    rv=2023.Q1 ==
 02  |    1,001 -  1,500  |  30,000 |   60,000 |  80,000    rv=2018.Q3)
 03  |    1,501 -  2,000  |  35,000 |   65,000 |  90,000
 04  |    2,001 -  4,000  |  35,000 |   70,000 |  95,000
 05  |    4,001 -  7,500  |  60,000 |   90,000 | 140,000
 06  |    7,501 -  9,000  |  65,000 |  100,000 | 150,000
 07  |    9,001 - 10,000  |  70,000 |  110,000 | 160,000
 08  |   10,001 - 14,000  |  90,000 |  135,000 | 220,000
 09  |   14,001 - 18,000  | 100,000 |  155,000 | 250,000
 10  |   18,001 - 20,000  | 105,000 |  165,000 | 260,000
 11  |   20,001 - 25,000  | 115,000 |  185,000 | 280,000
 12  |   25,001 - 35,000  | 130,000 |  210,000 | 300,000
 13  |   35,001 - 50,000  | 150,000 |  240,000 | 345,000
```

⇒ ONE official value-set spans [2018-08-19 .. ≥2023-02-26]
(rv=2018.Q3 / 2021.Q2 / 2023.Q1 interchangeable for tests). Deltas vs
rv=2018.Q2 stay exactly §A4(b)'s list; nothing new. The §A3(c) "late-rv
capture candidates" are hereby CONSUMED: no further server-rendered revision
exists in the archive of the original URL — any later change lives only on
the JS-only successor (b, negatives).

**(d) FT Jan-2025 230,000-mile DP — explained to mechanism level; cell stays open**

- Zoning recheck against repo data (`public/data/airports.json`, haversine
  R=3958.7613 statute mi): JFK-LHR 3,442 / LHR-HKG 5,984 / HKG-TPE 501 /
  TPE-KUL 2,017 / KUL-BKK 758 // jaw BKK⇢SIN 880 / SIN-HKG 1,594 /
  HKG-JFK 8,059 ⇒ flown **22,356**; incl-jaw **23,237**. OP's self-stated
  "flying distance of 19,442 miles" does NOT match the written chain under
  great-circle math (~2.9k short) — unresolved imprecision (same honesty
  pattern as Masumi, §A3(b)). BOTH readings fall in **zone 11
  (20,001–25,000)** of every recovered era, matching the AM agent's
  "20,000-25,000 range". Because flown-only already exceeds 20,001, this
  single DP cannot by itself demonstrate open-jaw counting — jaw inclusion
  rests on the official "sum of the sector distance of all sectors" clause
  (§A1(b)).
- **Cell search: 230,000 appears in NO cell of ANY recovered official era**
  (rv=2018.Q2, 2018.Q3, 2021.Q2, 2023.Q1; nearest zone-11 neighbors:
  First 235,000 pre-Aug-2018; {E 115,000 / J 185,000 / F 280,000} from
  2018-08-19 through 2023-02-26).
- Verdict: the DP pins a **fourth pricing era** effective inside
  (2023-02-26, 2025-01-25], coincident with the program migration
  ((a) timeline) — but its zone-11 values are NOT recoverable from Wayback
  raw HTML because every successor-page capture is a JS shell ((b)). Cabin
  stays UNSTATED (OP never names the class); 230,000 sits between the
  last-known J 185,000 and F 280,000 — plausibly revised Business OR rebased
  First; **do not assume either**. No new Iron Rule test activates from this
  section; existing `calib.cx-multicarrier.*` mechanisms (highest-class-wins;
  zone total includes all sectors; carrier minimums; no Premium Economy;
  50,000-mile ceiling) are unaffected. To close the cell: render the LIVE
  successor page in a browser session, transcribe the table, and pin it with
  its own rv label.

**(e) Budget & honesty note**

- Fetch budget exactly consumed: 4/4 page fetches (three target replays +
  bonus 20230226074714) and 1/1 batched CDX sweep. All raw artifacts cached
  under `%TEMP%\gcmp-research\`.
- Secondary PVG–GUM dating pass was NOT started: the primary consumed the
  full budget, and general web search was unavailable this session
  (AnySearch HTTP 402 auth outage — same degradation as §A3(d)). A
  browser-capable round could settle both leftovers in one sitting (render
  the successor award chart AND date UA PVG–GUM via aeroroutes).
- Confidence: (c) tables `chart-verified` (complete server-rendered
  transcriptions); every claim about the fourth era is inference from
  negatives — no cells fabricated.

### Suggested test ids from this addendum

- Activate now: `calib.cx-multicarrier.any-first-prices-as-first` (mechanism +
  14,000-mi boundary; band values `chart-verified` via A3's rv=2018.Q2 table —
  pin fixture rows from the chart, not the §A1(c) community couplet, per
  A3(b));
  `calib.cx-multicarrier.open-jaw-distance-counts`;
  `calib.cx-multicarrier.carrier-minimum-and-no-premium-economy`.
- RESOLVED (was "Keep TODO narrowed"): full AM band-table transcription done
  for rv=2018.Q2 via Wayback capture 20180528013013 — see A3(a). Remaining
  follow-up: late-rv captures (20210615190855 / 20240210095453 / 20240903150154)
  to pin post-2018 drift; do NOT reuse 2018 rows for late-rv assertions (A3(c)).
- `calib.sta-eligibility.br-gum-network-gap-warns` — data spec in A2(c);
  plus `calib.sta-eligibility.co-terminal-direct-vs-two-sectors` (conflict
  guard, parameterized both ways).

---

### A6 — JL/NH/SQ band-chart product scoping (Phase-7 research pass)

**Question:** for each of JAL Mileage Bank (JL), ANA Mileage Club (NH), and
KrisFlyer (SQ): does a distance-band RTW or RTW-adjacent award product exist
that `public/data/rtw-products/*` should model? Verdict vocabulary per charter:
`band-chart candidate` | `no compatible product`. Negatives welcome.

**(a) NH verdict: `band-chart candidate` — discontinued/archived; no data change proposed**

- Live capture 2026-08-23T23:25:48Z:
  https://www.ana.co.jp/en/gb/amc/partner-flight-awards/around-the-world/
  (HTTP 200, 36,985 bytes; cached `%TEMP%\gcmp-research\nh-atw-live.html`);
  page is fully server-rendered.
- Discontinuation notice verbatim: "As of June 23, 2025, the issuance of new
  Star Alliance Round the World Award Tickets is no longer available. Star
  Alliance Round the World award tickets issued up to June 23, 2025 can be used
  as usual until th[e ticket expiration]" — independently re-verifies
  `rtw-products/current.json` `ana-star-alliance-rtw-award`
  `status:"discontinued"` + `bookingStatusNote` (date matches exactly).
- Pricing basis verbatim: "For Round the World itineraries, the required
  mileage is calculated according to the total basic sector mileage for the
  entire itinerary. (Calculations exclude ground transportation sectors.)" —
  band pricing + `surfaceDistancePolicy:"excluded-from-distance"` now
  confirmed on the LIVE page (until now Case 4 pinned these community-side
  only).
- Band table still server-rendered today (row `20,001 to 22,000` present), so
  an official transcription could be taken from this same URL later if needed.
  Wayback brackets both sides of the cutoff: captures 20250317080157
  (pre-cutoff) / 20251117185037 / 20260313014905 (post-cutoff).
- Verdict rationale: the only distance-band RTW chart among JL/NH/SQ is NH's,
  and the repo already models it as discontinued. Case 4's archived-mode
  calibration stands; nothing added to `rtw-products`.

**(b) JL verdict: `no compatible product` (PARTIAL — direct fetch blocked)**

- www.jal.co.jp returned HTTP 403 twice (2026-08-23T23:24:31Z and
  2026-08-23T23:25:00Z, second attempt with full browser headers) → bot-level
  block on shell clients; no live artifact obtainable this pass.
- Wayback CDX probes for BOTH `jal.co.jp/en/jal-members/jmb/*` and
  `www.jal.co.jp/en/jal-members*` returned zero rows while an ANA control
  query in the same window returned 5 rows → absence of archive coverage for
  the current JMB subtree is real, not tooling failure. web_search channel
  dead session-wide (AnySearch HTTP 402 outage — same degradation as §A3(e));
  one 503 during tree probing noted.
- Alliance-level negative context (live capture 2026-08-23T23:35:38Z,
  https://www.oneworld.com/round-the-world, 64,771 bytes):
  "We offer three types of Round The World trips" — oneworld Explorer
  (continent-based), Global Explorer (distance-based), Circle Pacific — all
  three are revenue fares; the FAQ covers only EARNING miles on them. No
  alliance-level award-RTW product exists; multi-carrier AWARD products are
  program-specific, and the repo models exactly AA/QF/CX (none is JL).
- Structural reasoning (stated as reasoning, not citation): JMB prices
  international partner/oneworld awards zone-based per segment; no JMB RTW
  award product appears in any repo source. Confidence MEDIUM. Upgrade path:
  render JMB award pages in a real browser session and pin the absence
  against the live navigation.

**(c) SQ verdict: `no compatible product`**

- Discovery chain: guessed legacy path `/en_UK/us/member/kf-partner-airlines/…`
  soft-redirects to the locale homepage → sitemap index (locale sitemaps only)
  → KrisFlyer hub nav (`/en_UK/sg/ppsclub-krisflyer/`) → CDX subtree sweep
  (200 rows cached `%TEMP%\gcmp-research\cdx-sq-kf.txt`) → current redemption
  landing https://www.singaporeair.com/en_UK/sg/ppsclub-krisflyer/kf-flight-redemption/
  (live ≈2026-08-23T23:38:00Z ±60s, 129,958 bytes).
- That landing is today a "KrisFlyer Global Redemption Sale" promo page
  (title/h1 verbatim) with regional h2 sections and ZERO occurrences of
  star/alliance/chart/zone strings in raw HTML.
- Zero `round-the-world` mentions across all fetched SQ artifacts; the only
  star-alliance subtree pages found historically are earn-side
  (`earn-miles/earn-when-you-fly/star-alliance/`, 2016–2017 captures).
- Verdict: KrisFlyer flight redemptions are per-sector zone-based (the chart
  itself is JS/login-gated; not transcribed this pass); no RTW or
  distance-band award product exists. Confidence MEDIUM-HIGH on absence of an
  RTW product; a positive zone-chart transcription remains optional
  follow-up.

**(d) CX side-probe (raw-HTML closure of the A3(b) question)**

- https://flights.cathaypacific.com/en_HK/redeem-flights/flight-award-chart.html
  live HTTP 200 at 2026-08-23T23:25:59Z, 17,471 bytes: body carries
  `<div id="spa-root"></div>` plus clientlib-react bundles → confirmed JS
  shell. Plain HTML fetches CANNOT recover the live multi-carrier chart; the
  A3 follow-up "render the successor page in a browser session" is now proven
  necessary rather than suspected.

**(e) Budget & honesty note**

- All raw artifacts cached under `%TEMP%\gcmp-research\` (nh-atw-live.html,
  sq-kf-staralliance.html [homepage], cx-live-chart.html, ow-rtw.html,
  sq-sitemap.html, sq-kf-hub.html, sq-kf-flight-redemption.html, cdx-*.txt).
- Raw call ledger exceeded the ~6 fetches + 2 CDX box because two channels
  hard-failed (jal 403; search 402) and discovery required workarounds:
  origin/live ≈11 calls across 9 URLs / 5 hosts — ana ×3 (attempt 1 lost to a
  local PS 5.1 parse-prompt bug post-request; attempt 2 lost to a local
  PS 5.1 `-Encoding utf8NoBOM` save bug AFTER a successful request; attempt 3
  clean), jal 403 ×2, singaporeair ×4 (homepage redirect, sitemap.xml, kf hub,
  kf flight-redemption), flights.cathaypacific ×1, oneworld ×1; CDX API 10
  calls (ana control ×2, both healthy; jl subtree ×3 incl. one 503; sq old
  member subtree ×2; sq kf subtree ×1; plus the 504'd domain-wide sq probe).
  Zero Wayback page replays were needed.
- One capture timestamp (sq-kf-flight-redemption) is approximate (±60s) due to
  a logging-helper format error; the cached content itself is intact. No
  quotes above are fabricated; JL/SQ negatives are marked with their evidence
  grade.
- No code/data changes; nothing committed. No Iron Rule test activates from
  A6; existing `calib.*` mechanisms are unaffected.

## A7 — PVG–GUM dating + JL JMB upgrade attempt (Phase-8 research pass)

**(a) UA PVG–GUM discontinuation dating — advanced to a defensible window; effective month still unresolved**

- PTT ID decode (new finding): `M.1558378277.A.99D` embeds its creation epoch —
  PTT article-ID convention `M.<unixtime>.A.<nn>`. 1558378277 =
  2019-05-20T18:51:17Z = **2019-05-21 02:51:17 UTC+8** (verified locally,
  reproducible via `[DateTimeOffset]::FromUnixTimeSeconds(1558378277)`). The
  previously "undated" sole evidence is therefore datable: suspension was
  already an observed fact by 2019-05-21 Taiwan time
  ("上海飛關島UA已經停飛了"). Page confirmation failed:
  `https://www.ptt.cc/bbs/Aviation/M.1558378277.A.99D.html` returned 404
  (board guess), so the exact board/post body was not located this pass — the
  date rests on the ID-decode convention alone, graded MEDIUM-HIGH.
- Route start pinned (context for a closed entry): UA GUM–PVG passenger
  service began 2014-10-29 — en.wikipedia
  `Antonio_B._Won_Pat_International_Airport`, History section, identical in
  Wayback capture `20190820103721` (2019-08-20) and the current live revision;
  citations there: USA Today 2014-10-31 "Guam has high hopes for United
  service to Seoul, Shanghai"; mvariety "United Airlines inaugurates historic
  nonstop service between Guam and Shanghai, China".
- Absence corroboration: the 2019-08-20 revision's destinations table has ZERO
  Shanghai/PVG passenger rows (`<tr>` row-grep = 0 hits) while the same table
  annotates endings inline (Cebu Pacific Manila "(ends December 7, 2019)") — a
  PVG end-date simply was not documented there. The current live page lists
  Shanghai–Pudong ONLY under FedEx cargo (wikitext pairs it with "First FedEx
  Direct Express flight to Guam" refs); United PVG survives solely as History
  prose about the 2014 launch.
- Why the announcement/effective month stays unresolved — channel ledger:
  web_search dead session-wide (HTTP 402, known); Routesonline live search 403
  (bot block); DuckDuckGo html endpoint anomaly-walled (200-no-hits / 202);
  Bing served a JS shell (122 KB, zero extractable anchors); aeroroutes
  therefore unreachable via every open channel. Wayback CDX defect: EVERY
  `filter=` query (urlkey/original, regex or substring) returned empty 200s,
  while a no-filter control (`url=jal.co.jp&matchType=domain&limit=5`)
  instantly returned 1996–97 rows — the CDX index plane serves but the filter
  parameter soft-fails session-wide (consistent with A6(e)'s 504'd domain-wide
  sq probe). Unfiltered domain-wide pulls are unbounded, so client-side
  filtering could not substitute within budget.
- RECOMMENDATION (NOT applied — data owner decides): close the held
  network-gaps watch item as `{since:'2014-10', until:'2019-05'}` — since =
  first regular service 2014-10-29 (wiki-cited); until = last defensible bound
  "suspension already observed 2019-05-21 TW" (PTT ID decode). `until` is an
  upper bound: the true effective month is ≤2019-05 and unresolved. If
  warn-all semantics require an announced month rather than an observation
  bound, keep the item held instead.

**(b) JL verdict upgrade attempt — evidence upgraded; verdict stays MEDIUM**

- A6(b)'s zero-row probes targeted `jal.co.jp/en/jal-members/jmb/*` and
  `www.jal.co.jp/en/jal-members*` — the WRONG SUBTREE for the English consumer
  site. The real English JMB hub is `https://www.jal.co.jp/en/jmb/`, proven by
  a nav link inside Wayback capture `20200101023329` of `www.jal.co.jp/en/`
  and confirmed by direct raw replay (48,159 bytes). The absence claim narrows
  to `/en/jal-members/*` only; JMB Wayback coverage is real.
- Archived official pages recovered via the replay plane (live jal.co.jp
  remains bot-blocked per A6(b)):
  - `/en/jmb/` hub @20200101023329: nav inventory = program-guide subpages
    (`index01..09`), partners/lifestyle, dated notices
    (`/en/info/2018/jmb/180202.html`, `180207.html`, `180822.html` — YYMMDD
    slugs), enrollment flows — NO round-the-world award product link anywhere
    in the raw nav.
  - `/en/oneworld/` @20191212081348 (27,022 bytes): visible-text keyword
    counts — `award`=0, `redeem`=2, `earn`=1, `round the world`=1 (nav-level).
    Alliance content is earn-side only, corroborating A6(b)'s structural
    reasoning.
  - `/en/jalmile/use/jal/` @20190717204055 (37,422 bytes): H1s "JAL Group
    Airlines Award Tickets" / "Other ways to redeem miles for flights";
    `one-way`=2, `zone`=0, `area`=0, `round the world`=0, `RTW`=0. The
    redemption root frames awards per airline/ticket; no RTW product surfaced.
- Why it stays MEDIUM: these absences come from RAW HTML replays;
  jal.co.jp menus are partly JS-rendered, so static-HTML absence ≠
  rendered-DOM absence. A6(b)'s upgrade path (render JMB pages in a real
  browser session and pin against live navigation) remains the closure step;
  what changed is the target subtree is now correctly identified
  (`/en/jmb/`, `/en/jalmile/use/*`) and three dated archived anchors exist to
  diff against. Alternate hosts: all recovered captures are `www.jal.co.jp`;
  apex-vs-www equivalence not separately probed; `www.jal-japan.co.jp`
  assumed nonexistent, not probed (budget). JMB guide PDF hunt not completed —
  CDX mimetype filtering unusable this pass (defect above);
  `/cms/jalmile/en/jmbinfo.html` noted in hub nav, unfetched.

**(c) Budget & honesty note**

- All raw artifacts cached under `%TEMP%\gcmp-research\` with `a7-` prefix:
  a7-cdx-aeroroutes-guam.txt, a7-cdx-routesonline-pvg-gum.txt,
  a7-cdx-ronews-guam.txt, a7-cdx-jal-mileage.txt (all four EMPTY — filter
  defect), a7-ddg-pttid.html, a7-ddg-ro-shanghai-guam.html,
  a7-bing-ro-shanghai-guam.html, a7-jal-en-replay.html (120,938 B, capture
  20200101023329), a7-wiki-guam-2019.html (146,841 B, capture 20190820103721),
  a7-jal-jmb-hub-20200101.html (48,159 B), a7-wiki-guam-live-2026.html
  (353,601 B), a7-jal-oneworld-20200101.html (27,022 B, actual capture
  20191212081348), a7-jal-use-jal-replay.html (37,422 B, capture
  20190717204055). Failed requests (PTT 404, Routesonline 403) left no
  artifacts; errors are recorded here only.
- Call ledger EXCEEDED budget due to hard channel failures (same disclosure
  pattern as A6(e)): origin/live/replay 11 calls across 11 distinct URLs /
  6 hosts — ptt ×1 (404), routesonline ×1 (403), duckduckgo ×2 (bot-walls),
  bing ×1 (JS shell), web.archive.org replays ×5 (jal/en redirect probe;
  wiki 2019; jmb hub id_; oneworld id_; use/jal), en.wikipedia ×1 (live);
  against a ~6-fetch box. CDX API 5 calls against a 4 cap — 4 budgeted
  filtered queries (all empty-200 via the filter defect) + 1 diagnostic
  no-filter control (returned rows). Every overage call either yielded
  appendix evidence or a decisive tooling diagnosis.
- No quotes fabricated: the PTT post body was never fetched (only its ID
  decoded, stated as such); wiki sentences quoted verbatim from captures; jal
  keyword counts computed from the cached files; negatives marked with their
  evidence grade.
- No code/data changes; nothing committed. `public/data/network-gaps/current.json`
  NOT touched (recommendation only, §(a)). No Iron Rule test activates from
  A7; existing `calib.*` mechanisms are unaffected.
