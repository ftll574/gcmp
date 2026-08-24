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

## A8 — CI SkyTeam partner-award chart archaeology + OWE / Star Alliance RTW cash-fare adjudication

Researcher pass, team gcmp-phase9 task t1. Scope: recover the zone-based mileage chart behind
`china-airlines-skyteam-partner-award` (current entry: pricingBasis zones,
rejectsAtlanticAndPacificCrossing true, limits maxFlights 6 / maxStopovers 1 / maxSurfaceSectors 1);
adjudicate whether `oneworld-explorer` / `star-alliance-rtw-fare` belong in award-pricing scope.
Docs-only: NO other file touched, nothing committed.

### (a) Chart recovered — two full era matrices pinned; current-era numerals NOT recoverable

All evidence from official china-airlines.com pages replayed via Wayback raw id_ captures (cached
under %TEMP%\gcmp-research\a8-*):
- ERA-1 pinned by TWO captures whose rules text verifies identical:
  `https://web.archive.org/web/20151216204817/https://www.china-airlines.com/us/en/member/redeem-airline-miles/skyteam-partners/ticket-awards-skyteam.html`
  and `https://web.archive.org/web/20190822111127/…ticket-awards-skyteam.html`.
- ERA-2 pinned by `https://web.archive.org/web/20251008063633/…ticket-awards-skyteam` — the last
  fully recoverable numeric chart.
- CURRENT era: the old slug soft-404s since the Next.js redesign (archived shell
  `https://web.archive.org/web/20260606194931/…ticket-awards-skyteam` is a 356 KB NEXT_NOT_FOUND
  RSC shell; live URL renders "Page not found" in a real browser; Invoke-WebRequest is bot-blocked
  with HTTP 403). New canonical page
  `https://www.china-airlines.com/us/en/member/miles/redeem/reward-ticket` (archived
  `https://web.archive.org/web/20260705122302/…reward-ticket`): its RSC payload carries the full
  CURRENT rules text but ZERO numeric mileage tables — the numbers load client-side and are absent
  from the archive.
- RECOMMENDATION ONLY (not applied here): refresh the china-airlines-skyteam-partner-award
  sourceUrls in `public/data/rtw-products/current.json` to the new canonical path; the old slug is
  dead.

Region abbreviations (chart column order): NEA Northeast Asia, SEA Southeast Asia, SWA Southwest
Asia, ME Middle East, EU Europe, NAf North Africa, SAf South Africa, NAm North America, CAm Central
America, SAm South America, SWP Southwest Pacific. Upper triangle read L→R; '·' = blank mirror cell;
values are ROUND-TRIP miles in thousands (×1,000 for miles).

ERA-1 matrix — cabins Economy / Business / First Class:

```
Economy       NEA  SEA  SWA  ME   EU   NAf  SAf  NAm  CAm  SAm  SWP
NEA           45   50   70   90   110  120  120  110  110  120  110
SEA            ·   45   70   90   110  120  120  120  120  120  90
SWA            ·    ·   50   75   90   110  110  110  120  120  110
ME             ·    ·    ·    ·   50   60   90   100  110  110  120
EU             ·    ·    ·    ·   35   70   70   70   70   90   120
NAf            ·    ·    ·    ·    ·   40   60   70   70   80   120
SAf            ·    ·    ·    ·    ·    ·   80   80   100  70   120
NAm            ·    ·    ·    ·    ·    ·    ·   35   40   50   120
CAm            ·    ·    ·    ·    ·    ·    ·    ·   40   45   120
SAm            ·    ·    ·    ·    ·    ·    ·    ·    ·   40   120
SWP            ·    ·    ·    ·    ·    ·    ·    ·    ·    ·   70

Business      NEA  SEA  SWA  ME   EU   NAf  SAf  NAm  CAm  SAm  SWP
NEA           60   70   90   130  160  180  180  160  160  180  160
SEA            ·   60   90   130  160  180  180  180  180  180  130
SWA            ·    ·   70   95   130  160  160  160  180  180  160
ME             ·    ·    ·    ·   70   80   130  150  160  160  180
EU             ·    ·    ·    ·   50   90   90   90   90   130  180
NAf            ·    ·    ·    ·    ·   60   80   90   90   120  180
SAf            ·    ·    ·    ·    ·    ·   120  120  150  90   180
NAm            ·    ·    ·    ·    ·    ·    ·   50   60   70   180
CAm            ·    ·    ·    ·    ·    ·    ·    ·   60   60   180
SAm            ·    ·    ·    ·    ·    ·    ·    ·    ·   60   180
SWP            ·    ·    ·    ·    ·    ·    ·    ·    ·    ·   90

First Class   NEA  SEA  SWA  ME   EU   NAf  SAf  NAm  CAm  SAm  SWP
NEA           80   90   120  180  210  240  240  210  210  240  210
SEA            ·   80   120  180  210  240  240  240  240  240  180
SWA            ·    ·   90   130  180  210  210  210  240  240  210
ME             ·    ·    ·    ·   100  110  180  200  210  210  240
EU             ·    ·    ·    ·   75   120  120  120  120  180  240
NAf            ·    ·    ·    ·    ·   80   110  120  120  160  240
SAf            ·    ·    ·    ·    ·    ·   160  160  200  120  240
NAm            ·    ·    ·    ·    ·    ·    ·   75   80   90   240
CAm            ·    ·    ·    ·    ·    ·    ·    ·   80   80   240
SAm            ·    ·    ·    ·    ·    ·    ·    ·    ·   80   240
SWP            ·    ·    ·    ·    ·    ·    ·    ·    ·    ·   120
```

ERA-1 rules (verbatim; verified identical across the 2015-12-16 and 2019-08-22 captures):
- "Redemption levels are based on round-trip travel. The required mileage for redeeming one-way
  award tickets is the same as that for round trips."
- "The redemption level for the highest cabin class will apply if the award ticket journey involves
  different cabin classes." (mixed-cabin rule; highest-cabin applies)
- "One open-jaw and one stopover is allowed in the itinerary for SkyTeam award tickets."
- "An open-jaw itinerary must be in the same redemption area."
- "A stopover is a stop of over 24 hours at a place other than the destination and the turnaround
  point and must be in the same region as the point of origin or the destination."
- "For the purpose of flight connecting, SkyTeam award tickets allow a maximum of six sectors
  (including open-jaws). When the point of origin and the destination of itineraries are in
  different redemption region, transit points can be in different redemption regions…"
- Shortest-direct-route principle with all three via-prohibitions (byte-identical across BOTH
  eras): "The itinerary connections of SkyTeam award tickets must be the shortest direct route
  between the point of origin and the destination. Based on this principle, itineraries between
  Europe/Africa/Middle East and America shall not be via Asia/Southwest Pacific, itineraries
  between America and Asia/Southwest Pacific shall not be via Europe/Africa/Middle East and
  itineraries between Asia/Southwest Pacific and Europe/Africa/Middle East shall not be via
  Americas." — this trio is the operative wording behind rejectsAtlanticAndPacificCrossing.
- "Stopovers and transit points also have to comply with the shortest direct route principle and
  must be in the same direction during the itinerary (either eastbound or westbound). This means
  stopovers and transit points must be the points on…"

ERA-2 matrix (capture 2025-10-08) — cabins Economy / Premium Economy / Business (First Class
discontinued); explicit red table caption "unit: 1000 miles":

```
Economy          NEA  SEA  SWA  ME   EU   NAf  SAf  NAm  CAm  SAm  SWP
NEA              35   35   60   90   110  110  110  110  110  110  110
SEA               ·   35   50   90   110  110  110  110  110  110  90
SWA               ·    ·   35   75   90   110  110  110  110  110  110
ME                ·    ·    ·   35   50   60   90   100  110  110  120
EU                ·    ·    ·    ·   35   70   70   70   70   90   120
NAf               ·    ·    ·    ·    ·   35   60   70   70   80   120
SAf               ·    ·    ·    ·    ·    ·   80   80   100  70   120
NAm               ·    ·    ·    ·    ·    ·    ·   35   40   50   120
CAm               ·    ·    ·    ·    ·    ·    ·    ·   35   45   120
SAm               ·    ·    ·    ·    ·    ·    ·    ·    ·   35   120
SWP               ·    ·    ·    ·    ·    ·    ·    ·    ·    ·   35

Premium Economy  NEA  SEA  SWA  ME   EU   NAf  SAf  NAm  CAm  SAm  SWP
NEA              40   40   65   100  120  120  120  120  120  120  120
SEA               ·   40   55   100  120  120  120  120  120  120  100
SWA               ·    ·   40   85   100  120  120  120  120  120  120
ME                ·    ·    ·   40   55   65   100  110  120  120  130
EU                ·    ·    ·    ·   40   75   75   75   75   100  130
NAf               ·    ·    ·    ·    ·   40   65   75   75   90   130
SAf               ·    ·    ·    ·    ·    ·   90   90   110  75   130
NAm               ·    ·    ·    ·    ·    ·    ·   40   45   55   130
CAm               ·    ·    ·    ·    ·    ·    ·    ·   40   50   130
SAm               ·    ·    ·    ·    ·    ·    ·    ·    ·   40   130
SWP               ·    ·    ·    ·    ·    ·    ·    ·    ·    ·   45

Business         NEA  SEA  SWA  ME   EU   NAf  SAf  NAm  CAm  SAm  SWP
NEA              60   60   80   130  160  160  160  160  160  160  160
SEA               ·   60   70   130  160  160  160  160  160  160  130
SWA               ·    ·   60   95   130  160  160  160  160  160  160
ME                ·    ·    ·   60   70   80   130  150  160  160  180
EU                ·    ·    ·    ·   60   90   90   90   90   130  180
NAf               ·    ·    ·    ·    ·   60   80   90   90   120  180
SAf               ·    ·    ·    ·    ·    ·   120  120  150  90   180
NAm               ·    ·    ·    ·    ·    ·    ·   60   65   70   180
CAm               ·    ·    ·    ·    ·    ·    ·    ·   60   60   180
SAm               ·    ·    ·    ·    ·    ·    ·    ·    ·   60   180
SWP               ·    ·    ·    ·    ·    ·    ·    ·    ·    ·   60
```

ERA-2 deltas (verbatim):
- "One-way ticket award level will be calculated half of round-trip award ticket redemption
  level." — one-way semantics FLIPPED from Era-1 (was: same price as round trip).
- "Stopovers are not allowed for a one-way ticket. A maximum of three sectors are allowed for each
  one-way award ticket."
- "For the purpose of flight connecting, SkyTeam round-trip award tickets allow a maximum of six
  sectors (including open-jaws)." — six-sector cap now scoped to round-trips.
- "One open-jaw and one stopover are allowed in the itinerary for round-trip SkyTeam award
  tickets." (is→are, and scoped to round-trip)
- "A stopover refers to a stay of 24 hours or more at a point other than the destination and the
  turnaround point and must be in the same region as the origin or destination." (>24 h → ≥24 h;
  "point of origin" → "origin")
- "Redemption for Premium Economy Class award tickets is only available for flights providing
  Premium Economy class service."
- The ME diagonal — the UNIQUE blank diagonal in Era-1 — becomes PRICED (E35/P40/B60); its tail
  values (EU…SWP literal row) are IDENTICAL to Era-1's, retroactively confirming that the Era-1 ME
  blank was intentional and that no column shift occurred in either matrix.

Transcription honesty notes:
- Unit attribution: the 2015-12-16 page carries NO unit annotation anywhere (probe hits for 'unit',
  '1000', '1,000': zero); "unit: 1000 miles" is pinned by the 2019-08-22 capture (red span above
  the table) and repeated in Era-2. Thousands-scale for the 2015 numbers therefore rests on the
  2019 annotation + magnitude continuity + community figures, not on a 2015-page verbatim string.
- Era windows: Era-1 pinned at 2015-12-16 and 2019-08-22 (rules text verified identical; matrix
  transcribed consistently from both); intermediate captures exist (20210923 / 20240519 /
  20250324) but were not replayed within budget. Era-2 pinned 2025-10-08, superseded by the
  Next.js redesign some time ≤2026-06. If ever encoded, confidence grade = 'published-chart'
  (schema enum), era-tagged.
- Seasonality (separate archived page, WB 20190822112138 …/seasonality-chart.html, 105 KB):
  verbatim "During boom season, it is not allowed to redeem free ticket award for certain routes
  on Korea Air. Members must confirm the following blackout dates before redemption." followed by
  a route|departure blackout TABLE whose year columns are 2017/2018 only — era-limited snapshot,
  no general rule extractable.
- Community corroboration (search-snippet grade; pages NOT fetched): tripplus guide(七)
  (blog.tripplus.cc/zh/160308/brady_china_airlines_guide_2023_s07) quotes 「商務艙僅需35,000哩，
  來回商務艙僅需70,000哩」 — zone unspecified, so LOW grade; consistent with zone-based
  thousands-scale pricing but not reconcilable to a specific cell. FlyerTalk thread 2154364 p4:
  CI reviewed partner strategy after members used SkyTeam partner awards to fly CI (context for
  availability embargoes). PTT points M.1699878516.A.DA4: general dynamic-pricing QA context.
  Nothing contradicts either matrix.
- Current-era rules recovered from the RSC payload (verbatim excerpts; numerals ABSENT):
  "The flights to be taken through SkyTeam reward ticket redemption must be marketed and operated
  by the same SkyTeam partner airlines. Code-shared flights of SkyTeam partner airlines are not
  eligible for reward ticket redemption."; "(suspension of MU/FM one-way reward tickets, please
  refer to /us/en/member/announcements/20260629-1)"; fee schedule: reissue "A handling fee of
  TWD1,500 (or the equivalent amount in local currency) will be charged for reissuing a reward
  ticket.", refund legacy "To refund a totally unused reward ticket, a handling fee of TWD1,500…
  will be charged." (USD50 variant paragraph also present), no-show "A handling fee of USD100 on
  the long haul ticket, USD50 on the short haul ticket"; one-way 3-sector/no-stopover, RT 1 OJ +
  1 stopover, six-sector and shortest-direct-route sentences all still present.

### (b) Adjudication — oneworld-explorer / star-alliance-rtw-fare are cash fares; miles N/A

Both CONFIRMED as paid fares, matching their existing kind:'cash-rtw-fare'; keep OUT of
award-pricing scope; no catalog change required.
- oneworld-explorer — live https://www.oneworld.com/round-the-world (cached, 64 KB): "oneworld
  Explorer: a continent-based fare," / "Global Explorer: a distance-based fare," / "Circle
  Pacific: an inter-continental journey…"; sold via the oneworld.com booking tool with cabin
  dropdown; miles appear earn-side only ("earn more miles and points"). Caveat: individual
  programs historically sell continent-count AWARDS shaped like Explorer (e.g., AA) — those would
  need a separate productId if ever added; UNVERIFIED this pass (LOW grade).
- star-alliance-rtw-fare — live
  https://roundtheworld.staralliance.com/staralliance/en/round-the-world (cached, 101 KB): sold
  via Book and Fly; "Your Round the World fare qualifies to earn miles and points in your Frequent
  Flyer Programme." (= earn-side). Validity note seen: First Class RTW / Circle Pacific issued
  from 1JUL26 must be completed within 12 months or by 1OCT27. Mileage analogue is already modeled
  as separate program awards (cf. archived ana-star-alliance-rtw-award).
- Coverage-gap observation only: Global Explorer and Circle Pacific are additional cash RTW fares
  absent from the gcmp catalog (no action taken).

### (c) Award-pricing proposal — BLOCKED ON SCHEMA EXTENSION (do NOT shoehorn into distance-band)

src/lib/schemas/award-pricing.ts constraints: L54 pricingModel enum ['fixed-rtw','distance-band']
has NO zone model; AwardPricingBandSchema {minMiles, maxMiles, prices} cannot express zone-pair
prices without fabricating mileage thresholds; L3 cabin enum ['economy','business','first'] lacks
premium-economy (required by Era-2). Encoding the zone chart as distance bands would misprice real
itineraries — explicitly rejected. Required extension: pricingModel +'zone-pair'; zone-keyed band
shape {originRegion, destinationRegion, prices}; AwardPricingCabinSchema +'premium-economy'.
Proposed product fragment (NOT directly applicable until that extension lands; full band list =
the §(a) matrices ×1,000):

```json
{
  "productId": "china-airlines-skyteam-partner-award",
  "label": "China Airlines Dynasty Flyer SkyTeam partner award",
  "pricingModel": "zone-pair",
  "confidence": "published-chart",
  "currency": "miles",
  "asOfEra": "2025-10",
  "sourceUrls": [
    "https://web.archive.org/web/20251008063633/https://www.china-airlines.com/us/en/member/redeem-airline-miles/skyteam-partners/ticket-awards-skyteam",
    "https://web.archive.org/web/20190822111127/https://www.china-airlines.com/us/en/member/redeem-airline-miles/skyteam-partners/ticket-awards-skyteam.html"
  ],
  "notes": [
    "Zone chart, upper triangle; values are ROUND-TRIP miles; one-way = half round-trip (Era-2 rule).",
    "First Class discontinued in Era-2; Premium Economy added.",
    "Superseded by Next.js redesign <=2026-06; live numeric chart not archive-recoverable.",
    "Routing rejects any itinerary crossing both the Pacific and the Atlantic (shortest-direct-route via-prohibitions)."
  ],
  "zones": ["NEA", "SEA", "SWA", "ME", "EU", "NAf", "SAf", "NAm", "CAm", "SAm", "SWP"],
  "bands": [
    { "originRegion": "NEA", "destinationRegion": "EU",  "prices": { "economy": 110000, "premiumEconomy": 120000, "business": 160000 } },
    { "originRegion": "NEA", "destinationRegion": "SWP", "prices": { "economy": 110000, "premiumEconomy": 120000, "business": 160000 } },
    { "originRegion": "SWP", "destinationRegion": "SWP", "prices": { "economy": 35000, "premiumEconomy": 45000, "business": 60000 } }
  ]
}
```

Sample bands only above; when the schema extension is approved, machine-generate all pairs from the
cached HTML instead of hand-transcribing 66 pairs into docs.

### (d) Suggested calib.* test ids (docs-only; none activated)

- calib.ci-skyteampartner.zone-pair-era2-chart — pin sample cells once a zone-pair model exists
  (NEA→EU B 160,000 RT; NEA→SWP E 110,000 RT; SWP→SWP E 35,000 RT).
- calib.ci-skyteampartner.oneway-half-of-roundtrip-era2 — OW NEA→EU B = 80,000 = half RT.
- calib.ci-skyteampartner.oneway-equals-roundtrip-era1 — pre-change semantics guard (era-tagged).
- calib.ci-skyteampartner.rt-six-sectors-one-openjaw-one-stopover.
- calib.ci-skyteampartner.oneway-three-sectors-no-stopover-era2.
- calib.ci-skyteampartner.rejects-via-third-ocean-region — the three via-prohibitions (both eras).
- calib.ci-skyteampartner.era1-me-diagonal-blank — ME is the UNIQUE blank Era-1 diagonal (every
  other diagonal is priced); guards against column-shift misreads; ME prices at 35 in Era-2.
- calib.ci-skyteampartner.mufm-oneway-suspension-note-current — current-era MU/FM suspension rule pin.

### (e) Budget + honesty ledger

Origin/live/replay: 10 budgeted + 1 disclosed retry = 11 vs cap 10 (A7-style overage disclosure):
1. live reward-tickets-skyteam Invoke-WebRequest → HTTP 403 FAILED (bot-block; error-only, no artifact)
2. WB replay 20190822111127 (Era-1 .html, 146,433 B) OK
3. WB replay 20151216204817 (Era-1, 78,596 B) OK
4. WB replay 20260606194931 (NEXT_NOT_FOUND RSC shell, 356,520 B) OK — negative evidence
5. WB replay 20190822112138 (seasonality, 105,422 B) OK
6. WB replay 20251008063633 (Era-2, 149,704 B) OK
7. browser render live reward-tickets-skyteam → "Page not found" — negative evidence
8. browser render live hk/en/member/miles/redeem/reward-ticket → loaded, but cookie-consent overlay
   blocked DOM observation; screenshot attempt failed ("image readback failed"); RPC-timeout retry
   navigation of the SAME URL = overage call #11, yielded nothing
9. live oneworld.com/round-the-world OK (64,815 B)
10. live roundtheworld.staralliance.com/…/round-the-world OK (101,857 B)

CDX API: exactly 5/5 (cap respected). All matchType=prefix, NO filter= param (filter defect
avoided); every prefix returned rows: (1) prefix us/en/member/redeem-airline-miles collapse=urlkey
→ 33 rows; (2) prefix …/skyteam-partners → 22 rows; (3)(4)(5) prefixes us|hk|tw
/en/member/miles/redeem → 15/2/3 rows. Cached: a8-cdx-ci-redeem-prefix.txt,
a8-cdx-ci-skyteam-partners-all.txt, a8-cdx-ci-newmiles-{us,hk,tw}.txt.

Search plane (separate ledger): web_search ×1 (3 queries; WORKED — no HTTP 402 this session,
contradicting the stale-defect warning) + anysearch_batch_search ×1 (4 items; the PTT / FlyerTalk /
tripplus snippets cited above).

Cache (%TEMP%\gcmp-research\, 14 files): a8-ci-wb-2015-ticket-awards-skyteam.html 78,596 B;
a8-ci-wb-2019-ticket-awards-skyteam.html 146,433 B; a8-ci-wb-2019-seasonality-chart.html 105,422 B;
a8-ci-wb-2025-ticket-awards-skyteam.html 149,704 B; a8-ci-wb-2026-ticket-awards-skyteam.html
356,520 B; a8-ci-wb-2026-new-reward-ticket.html 1,583,441 B; a8-ci-wb-2026-rsc-payload.txt
75,622 B; a8-ow-live-round-the-world.html 64,815 B; a8-star-live-round-the-world.html 101,857 B;
plus the five CDX dumps above. The failed live fetch left no artifact (error-only convention).

Tooling lessons: Wayback filter= soft-fails (empty 200s) → bypassed with matchType=prefix;
JS-shell negative heuristic differs on Next.js sites (356 KB RSC-bearing NEXT_NOT_FOUND shell ≠
the legacy 13–15 KB title-only shell); RSC payloads yield SPA SSR text via regex
self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\] + [regex]::Unescape; CI bot-blocks
Invoke-WebRequest (403) yet allows a real-browser render; the cookie modal persists across clicks
(the consent cookie is never set) so DOM stays unreadable behind the overlay; PS5.1: avoid
comma-form -replace args and multi-arg .Substring mistakes.

No quotes fabricated: every verbatim string above was re-verified against local cache immediately
before writing; two recalled wordings were corrected by zero-hit probes (Era-2 says "round-trip
SkyTeam award tickets", not "reward"); the Era-1 unit-annotation absence was recorded instead of
assumed. No code/data changes; nothing committed; the rtw-products sourceUrl update is a
recommendation only; no Iron Rule test activates from A8; existing calib.* mechanisms are
unaffected.

## A9 — CX fourth-era multi-carrier chart: community-DP closure (follow-up pass)

Question (consumes §A5(d)'s open cell): can community DPs from 2024–2026 posts explain or pin the
FT 2184572 Jan-2025 data point (~230,000 miles at a self-stated 19,442 flown miles, cabin unstated)
that matches NO cell of the frozen eras (rv=2018.Q3 ≡ 2021.Q2 ≡ 2023.Q1)? Method: web_search +
shell-HTTPS page fetches only — no Wayback, no browser this pass.

**(a) VERDICT: ≥2 consistent DPs pin Zone 10 (18,001–20,000 mi) Business = 230,000**

- DP-1 — FT 2184572, Jan-2025 (thread already transcribed §A3/A5): OP self-stated "flying distance
  of 19,442 miles", agent-priced **230,000 Asia Miles**, cabin never named.
- DP-2 — Prince of Travel guide, published AND modified 2025-07-16 (cache
  `%TEMP%\gcmp-research\a9-pot-multicarrier-chart.html`, 200,975 B), verbatim: "The total distance
  clocks in at **19,150 miles,** so we'll fall into **Zone 10** of the chart and pay **115,000
  Asia Miles** in economy class or **230,000 Asia Miles** for business class."
⇒ Two independent sources place ~19.2–19.4k flown miles at Business 230,000 under one zone-banded
chart ⇒ approximate-fourth-era pin at confidence `community-corrected`. Bonus: FT's cabin UNSTATED
resolves to BUSINESS (230k is the J cell; E is 115k).

**(b) Static-chart corroboration — Suitesmile grid (post-1-May-2026 state)**

Suitesmile, published 2026-05-02 (cache `a9-suitesmile-hidden-charts.html`, 262,285 B), intro
verbatim: charts "take into account the most recent Asia Miles award changes/devaluation that took
effect on 1 May 2026." Its "Award chart for oneworld multi-carrier" table, transcribed verbatim:

```
zone | actual flown miles | Economy | Business | First   (fourth era, as of 2026-05-02;
 01  |        0 -    1,000|  30,000 |   60,000 |  75,000  zone EDGES identical to
 02  |    1,001 -  1,500  |  35,000 |   65,000 |  85,000  rv=2018.Q3; values revised)
 03  |    1,501 -  2,000  |  40,000 |   70,000 |  95,000
 04  |    2,001 -  4,000  |  45,000 |   80,000 | 110,000
 05  |    4,001 -  7,500  |  63,000 |  100,000 | 150,000
 06  |    7,501 -  9,000  |  68,000 |  120,000 | 165,000
 07  |    9,001 - 10,000  |  77,000 |  135,000 | 175,000
 08  |   10,001 - 14,000  |  95,000 |  170,000 | 250,000
 09  |   14,001 - 18,000  | 105,000 |  210,000 | 310,000
 10  |   18,001 - 20,000  | 115,000 |  230,000 | 330,000  ← DP-corroborated cells
 11  |   20,001 - 25,000  | 126,000 |  250,000 | 350,000
 12  |   25,001 - 35,000  | 140,000 |  265,000 | 365,000
 13  |   35,001 - 50,000  | 160,000 |  280,000 | 380,000
```

Zone-10 row matches PoT exactly (E115/B230). Caveat: only zone-10 Economy/Business are
DP-corroborated for the PRE-May-2026 window; every other cell above is a single-source
transcription of the POST-devaluation state (reference-only until independently checked).
Premium Economy remains absent, consistent with the no-PE terms.

**(c) Fourth-era deltas vs frozen rv=2018.Q3/2021.Q2/2023.Q1**

Band edges UNCHANGED (same 13 zones, same mile ranges) — only prices moved, every cell up:
long-haul hit hardest — Business z09 +55k (155→210), z10 +65k (165→230), z11 +65k (185→250),
z12 +55k; First z09 +60k, z10/z11 +70k each; short-haul mild (+5–15k across all cabins; z05–z07
Economy +3–7k). This explains §A5(d)'s puzzle verbatim: 230,000 sat between frozen-era J185k and
F280k because it IS the revised Business price. No new mechanism — same zone-band model,
highest-class-wins and carrier rules carry over per Reddit r/awardtravel 1ff4qdh ("You will be
charged the first class price if you include even one F segment").

**(d) Era timeline & open tension (recorded, not resolved)**

- Effective bracket stays **(2023-02-26, 2025-01-25]** exactly as §A5(d): web_search ×3 surfaced
  NO dated mid-2024 multi-carrier increase thread (Reddit 14s9818 "Major Devaluation" is Jul-2023
  CX own-metal — different product), so Jan-2025 remains the earliest observed fourth-era price.
- AwardWallet: "In April 2025, Asia Miles debuted new award charts for flights on its own metal
  and for Oneworld multi-carrier/round-the-world bookings" — that is the PUBLIC documentation
  moment, AFTER the first observed fourth-era price ⇒ treat Apr-2025 as publication date, not
  effect date.
- OPEN TENSION: the AM agent verbally told the FT OP "20,000–25,000 range" (=zone 11), and
  §A5(d)'s jaw-inclusive math (23,237 mi) agrees with zone 11 — where the CURRENT grid says
  B250k ≠ 230k paid. The 230k payment instead fits zone-10 Business under flown-only distance
  (19,442). Favored reading: OP was zoned by flown sectors into zone 10; the agent's verbal range
  quote stays unexplained. As in §A5(d), this DP must NOT be used to settle the open-jaw-counting
  question either way.
- Catalog flag (observation only, NOT edited here):
  `public/data/award-pricing/current.json` cx-asia-miles-oneworld-multi-carrier-award bands were
  seeded from generic references and diverge from BOTH recovered states — e.g. its 20001–25000 row
  is E120k/J175k/F270k vs official-frozen E115/J185/F280 vs fourth-era E126/J250/F350; its
  18001–20000 row E110k vs official-frozen E105k / fourth-era E115k. Any t3-style application
  should rebase against these pinned tables, not the seeds.

**(e) Suggested calib.* test ids (docs-only; none activated)**

- calib.cx-multicarrier.fourth-era-zone10-business-230k — 19,442 mi and 19,150 mi both ⇒ B 230,000.
- calib.cx-multicarrier.fourth-era-band-edges-unchanged — 13 zone edges byte-equal to rv=2018.Q3.
- calib.cx-multicarrier.fourth-era-zone11-business-250k-current — current-grid guard (suitesmile).
- calib.cx-multicarrier.no-premium-economy-cabin-fourth-era.

**(f) Budget & honesty ledger**

web_search 3 calls / 9 queries vs ≤8-call cap ✓; page fetches 2/4 (princeoftravel.com → 200,
200,975 B; suitesmile.com → 200, 262,285 B; both cached under %TEMP%\gcmp-research\a9-*); CDX 0;
Wayback 0; browser 0. The PoT sentence and Suitesmile rows above were extracted verbatim from the
cached HTML immediately before writing; AwardWallet/Reddit lines are search-snippet grade and
marked as such. Confidence: zone-10 {E,B} = community-corrected (two independent DPs); full grid =
single-source post-devaluation transcription. No code/data changes; nothing committed; no Iron
Rule test activates from A9; existing calib.cx-multicarrier.* mechanisms unaffected.

## A10 — Taiwan-first weekly-schedule transcription (Phase-10 research pass)

Question (consumes `docs/decisions/flight-schedule-model.md` S3/S5): can weekly operating days
(ISO weekday 1=Mon..7=Sun) be PINNED with citable sources for the Taiwan-first carrier pairs?
Unverified pairs are omitted, never guessed (S3). Method: web_search discovery + AeroRoutes
article fetches (day-coded transcriptions of airline OAG/GDS filings) + Wayback raw `id_`
replays (CDX `matchType=prefix`, NO `filter=` per checklist). Gold artifact: China Airlines
official complete-timetable PDF recovered from Wayback and text-extracted with pypdf. Research
window: late Aug 2026 (post-2026-08-23). Day-code conventions: AeroRoutes trailing tokens =
operating days (`D`=daily; bare digits = ISO weekdays, e.g. `246`=Tue/Thu/Sat; `x12`=EXCEPT
Mon/Tue); CI PDF tables use a 7-position day grid whose extracted digit runs (`1234567`,
`3  5  7`) carry the same meaning (spacing garbles under extraction; digit PRESENCE is the
signal). Confidence vocabulary per checklist: carrier-official artifact = `chart-verified`;
AeroRoutes transcription of filings = `community-corrected`.

### (a) Pinned pairs (verbatim evidence)

**CI block — official complete timetable PDF, validity 2025-01-01 → 2025-03-29** (replay
`https://web.archive.org/web/20250319152449id_/https://www.china-airlines.com/us/en/Images/timetable-20250101-20250329_tcm162-4228.pdf`,
1,843,009 B captured 2025-03-19; validity confirmed by filename AND in-PDF "01Jan25 - 29Mar25"
plus Jan/Feb/Mar-2025 calendar pages; caches `sc-ci-wb-2025-timetable.{pdf,txt}`; grade
chart-verified for every row below):

- TPE→HKG (PDF p.7) verbatim extraction: "TAIPEI TAOYUAN … HONG KONG 1h50m ~ 2h05m / CI 601
  1234567 07:15-09:15 / CI 903 1234567 08:05-10:05 / CI 909 1234567 10:50-12:55 / CI 915
  1234567 14:30-16:30 / CI 919 1234567 16:55-19:00 / CI 923 1234567 18:10-20:10 / CI 921
  [  23  5  7] 21:10-23:00 / CI 607 [1    4  6] 22:30-00:20+1" ⇒ route operates ALL 7 days;
  six dailies + CI921{2,3,5,7} + CI607{1,4,6}; all rows "EQV" (equipment varies).
- TPE→NRT (p.4): "CI 100 1234567 09:30-13:30 / CI 104 1234567 12:35-16:35 / CI 108 1234567
  14:35-18:40 / CI 106 [    3  5  7] 16:25-20:25" + partner rows "CI 9902 (JL 802) 1234567 …
  CI 9958 (JL 8664) 1234567" ⇒ own-metal daily (CI100/104/108) + CI106{3,5,7}; codeshares are
  JL-operated and excluded from flightNumbers.
- TPE→LAX (p.9): "CI 006 [    3  5  7] 16:55-12:30 359 01Jan25-07Mar25 / CI 006 [    3  5  7]
  16:55-13:30 359 09Mar25-28Mar25 / CI 008 1234567 23:50-19:35 77W 01Jan25-08Mar25 / CI 008
  1234567 23:50-20:35 77W 09Mar25-29Mar25" ⇒ CI008 daily throughout (arrival-time change at
  09Mar25 DST); CI006{3,5,7} both sub-windows.
- BONUS pairs, same source/window: TPE→KIX "CI 156 1234567 / CI 152 1234567 / CI 172 1234567"
  (p.4); TPE→BKK "CI 833 / CI 831 / CI 835 / CI 837" all 1234567 (p.5); TPE→SFO "CI 004
  1234567 23:45-18:50 77W" with return "CI 003 1234567" (p.9). OPEN LEAD: whether CI TPE-SFO
  survived past 2025-03-29 was NOT researched; do not infer current status from this row.

**BR block — AeroRoutes NS26 filing transcriptions** (grade community-corrected):

- TPE→SFO (`https://www.aeroroutes.com/eng/251229-brns26sfo`, published 29DEC25): "From
  29MAR26, the daytime BR008/007 service will see 787-9 operating, replacing 777-300ER." +
  flight list "BR008 TPE1015 – 0635SFO 789 D · BR018 TPE1940 – 1600SFO 77W D · BR028 TPE2340 –
  2000SFO 77W D" (+ returns BR017/BR027/BR007 all D) ⇒ THREE dailies, all 7 days,
  effective from 2026-03-29. Cache `sc-aero-br-ns26sfo.html`.
- TPE→SIN (same article): "the carrier once again schedules 787-9 aircraft on 1 of 2 daily
  Taipei Taoyuan – Singapore route from 22APR26 to 09MAY26 … BR225 TPE0740 – 1200SIN 77W D ·
  BR215 TPE0925 – 1350SIN 789 D" (+ returns BR226/BR216 D) ⇒ two dailies, all 7 days; the
  dated window is an EQUIPMENT swap on one frequency, not a service gap.

**JX block — AeroRoutes** (grade community-corrected):

- TPE→KIX (`https://www.aeroroutes.com/eng/260114-jxapr26kix`, published 14JAN26): "From
  03APR26 to 30APR26, JX820/821 service will be operated by Airbus A350-900 aircraft … During
  this period the airline schedules 2 daily flights with the A350-900. JX820 TPE0830 –
  1215KIX 359 D · JX822 TPE1015 – 1400KIX 359 D" ⇒ daily ×2 within the STATED window
  2026-04-03..2026-04-30. Cache `sc-aero-jx-apr26kix.html`.
- TPE→NRT (`https://www.aeroroutes.com/eng/260730-jxnw26nrt`, published 30JUL26): "The 3rd
  daily JX804/805 service from 01DEC26 to 28FEB27 will be operated by a mix of A350-900/-1000…
  JX800 TPE0825 – 1235NRT 351 D · JX802 TPE1010 – 1420NRT 351 D · JX804 TPE1500 – 1900NRT
  359 12 · JX804 … 351 x12" ⇒ JX800/JX802 daily year-round pattern; JX804 daily VIA EQUIPMENT
  SPLIT (A359 on days {1,2}, A351 remaining days) — this reading of `12`+`x12` as a complementary
  pair is documented here for t3; third-daily state explicitly windowed 2026-12-01..2027-02-28.
  Cache `sc-aero-jx-nw26nrt.html`.

**CX block — AeroRoutes** (grade community-corrected):

- HKG→LHR April-2026 EXTRA sections (`https://www.aeroroutes.com/eng/260320-cxapr26eu`,
  published 20MAR26): "Hong Kong – London Heathrow 02APR26 – 30APR26 Increase from 32 to 35
  weekly, CX239/256 operated by 777-300ER/A350-900 · CX239 HKG1105 – 1810LHR 77W 246 · CX239
  HKG1105 – 1810LHR 359 35 · CX256 LHR2015 – 1545+1HKG 77W 246 · CX256 … 359 35" ⇒ the +3
  weekly EXTRAS run days {2,3,4,5,6} on CX239 in the HKG→LHR direction (77W rotation {2,4,6},
  A359 rotation {3,5}); CX256 rows describe the LHR→HKG return legs. This entry describes the
  extras ONLY — base coverage (32 weekly) is NOT day-pinned here. Windowed seasonal entry.
  Cache `sc-aero-cx-apr26eu.html`.

### (b) Negatives & non-pins

- china-airlines.com HTML timetable = form/JS shell in BOTH replayed eras: capture
  `us/en/fly/flight-status/timetable.html @20190822115248` renders "Flight Timetable / Select
  Your Airport From / To / Date … Submit"; capture `…/timetable @20151214215604` identical +
  "Download our complete timetable as pdf for your own records." link (which led to the PDF
  gold above). Caches `sc-ci-wb-{2015,2019}-timetable.html`.
- `/eBooking/` ASP.NET portal: domain CDX holds only `?aspxerrorpath=/eBooking/en/Timetable.aspx`
  (a 2026 error-path capture); subtree prefix query returned **0 rows** — no archived
  server-rendered timetable exists under that path.
- evaair.com: `_download-files/timetables-downloads/pdf-timetables-download-en.html
  @20130330002950` replays as country-selector/nav shell with ZERO pdf hrefs (cache
  `sc-br-wb-2013-pdftt-page.html`) — EVA's downloadable-timetable trail goes cold in Wayback;
  live `en-global/about-eva-air/news/travel-news/2026-05-26-notice-of-flight-schedule-adjustment.html`
  → **HTTP 403 bot-block** on shell fetch (error-only convention, no artifact; matches A8's
  CI-403 lesson). `booking.evaair.com/flyeva/EVA/B2C/flight-schedules.aspx` is an interactive
  app ("please use the 'Online Search' function above", search-snippet grade) — not replayed,
  expected JS shell.
- Counts-without-weekday-resolution (context only, NOT entries): CX May/Jun-2026 reductions
  (`260419-cxmay26`, period 16MAY26–30JUN26): HKG–TPE 548→543 flights, HKG–SIN 368→358,
  HKG–NRT 219→209, HKG–SYD 173→163, HKG–BKK 340→308 (period totals; no days). Cache
  `sc-aero-cx-may26.html`. BR TPE–HKG 2Q26 (`260414-br2q26hkg`): "Taipei Taoyuan – Hong Kong
  04MAY26 – 26JUN26 Reduce from 46 to 44 weekly (BR809/810 4 weekly service to be reduced to
  2 weekly during this period)" — weekly counts, days unstated. Cache `sc-aero-br-2q26hkg.html`.
- NOT attempted (budget discipline): cathaypacific.com `book-a-trip/timetable.html` browser
  render; Wikipedia destination lists (weekly-COUNT columns cannot fill daysOfWeek);
  evaair.com Excel-timetable path (`excel-timetables-download-en.html @20161019202217` exists);
  second CI window `timetable-20230701-20231028_tcm162-4228.pdf @20230803104026` (cheap
  follow-up for whoever extends this).
- OMISSIONS (no day-level source found within budget — honest skips): BR TPE→NRT / KIX / LAX /
  BKK / SGN / HAN; CX HKG→TPE / NRT / SIN / SYD. These MUST stay out of the seed catalog.

### (c) Machine-readable summary for t3

Apply verbatim as ScheduleEntrySchema rows. Normalizations: flightNumbers written without
inner spaces, leading zeros preserved ("CI008"); partner-operated CI9xxx/JL numbers excluded;
daysOfWeek = union over listed own-metal flights; CI entries carry their PDF validity window
(expired windows produce no engine findings per S4 — they seed the catalog honestly, they do
not power current-date warnings); BR/JX/CX effectiveFrom values are season/filing dates stated
in the cited articles.

```json
[
  {"carrier":"CI","pair":["TPE","HKG"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["CI601","CI903","CI909","CI915","CI919","CI921","CI923","CI607"],"effectiveFrom":"2025-01-01","effectiveUntil":"2025-03-29","status":"operating","confidence":"chart-verified","sourceUrls":["https://web.archive.org/web/20250319152449id_/https://www.china-airlines.com/us/en/Images/timetable-20250101-20250329_tcm162-4228.pdf","https://www.china-airlines.com/us/en/Images/timetable-20250101-20250329_tcm162-4228.pdf"],"notes":"Six dailies (CI601/903/909/915/919/923) plus CI921 days{2,3,5,7} and CI607 days{1,4,6}; all equipment EQV."},
  {"carrier":"CI","pair":["TPE","NRT"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["CI100","CI104","CI108","CI106"],"effectiveFrom":"2025-01-01","effectiveUntil":"2025-03-29","status":"operating","confidence":"chart-verified","sourceUrls":["https://web.archive.org/web/20250319152449id_/https://www.china-airlines.com/us/en/Images/timetable-20250101-20250329_tcm162-4228.pdf"],"notes":"CI100/104/108 daily, CI106 days{3,5,7}; JL-operated codeshares CI9902(JL802)/CI9958(JL8664) daily excluded from flightNumbers."},
  {"carrier":"CI","pair":["TPE","LAX"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["CI008","CI006"],"effectiveFrom":"2025-01-01","effectiveUntil":"2025-03-29","status":"operating","confidence":"chart-verified","sourceUrls":["https://web.archive.org/web/20250319152449id_/https://www.china-airlines.com/us/en/Images/timetable-20250101-20250329_tcm162-4228.pdf"],"notes":"CI008 daily across both DST sub-windows (arr 19:35 to 08Mar25, 20:35 from 09Mar25); CI006 days{3,5,7} both sub-windows."},
  {"carrier":"CI","pair":["TPE","KIX"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["CI156","CI152","CI172"],"effectiveFrom":"2025-01-01","effectiveUntil":"2025-03-29","status":"operating","confidence":"chart-verified","sourceUrls":["https://web.archive.org/web/20250319152449id_/https://www.china-airlines.com/us/en/Images/timetable-20250101-20250329_tcm162-4228.pdf"],"notes":"Three dailies; beyond priority set, transcribed as bonus."},
  {"carrier":"CI","pair":["TPE","BKK"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["CI833","CI831","CI835","CI837"],"effectiveFrom":"2025-01-01","effectiveUntil":"2025-03-29","status":"operating","confidence":"chart-verified","sourceUrls":["https://web.archive.org/web/20250319152449id_/https://www.china-airlines.com/us/en/Images/timetable-20250101-20250329_tcm162-4228.pdf"],"notes":"Four dailies; beyond priority set, transcribed as bonus."},
  {"carrier":"CI","pair":["TPE","SFO"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["CI004"],"effectiveFrom":"2025-01-01","effectiveUntil":"2025-03-29","status":"operating","confidence":"chart-verified","sourceUrls":["https://web.archive.org/web/20250319152449id_/https://www.china-airlines.com/us/en/Images/timetable-20250101-20250329_tcm162-4228.pdf"],"notes":"Daily CI004 (return CI003 daily). Post-window operation NOT researched — open lead."},
  {"carrier":"BR","pair":["TPE","SFO"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["BR008","BR018","BR028"],"effectiveFrom":"2026-03-29","status":"operating","confidence":"community-corrected","sourceUrls":["https://www.aeroroutes.com/eng/251229-brns26sfo"],"notes":"Three dailies from NS26; BR008 upgauged to 787-9 from 29MAR26; returns BR007/017/027 all D."},
  {"carrier":"BR","pair":["TPE","SIN"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["BR225","BR215"],"effectiveFrom":"2026-03-29","status":"operating","confidence":"community-corrected","sourceUrls":["https://www.aeroroutes.com/eng/251229-brns26sfo"],"notes":"Two dailies; 787-9 swap on one frequency 22APR26-09MAY26 is equipment-only, not a service gap."},
  {"carrier":"JX","pair":["TPE","KIX"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["JX820","JX822"],"effectiveFrom":"2026-04-03","effectiveUntil":"2026-04-30","status":"operating","confidence":"community-corrected","sourceUrls":["https://www.aeroroutes.com/eng/260114-jxapr26kix"],"notes":"Two dailies explicitly within stated window (A350-900 incl. First Class period)."},
  {"carrier":"JX","pair":["TPE","NRT"],"daysOfWeek":[1,2,3,4,5,6,7],"flightNumbers":["JX800","JX802","JX804"],"status":"operating","confidence":"community-corrected","sourceUrls":["https://www.aeroroutes.com/eng/260730-jxnw26nrt"],"notes":"NW26 filing: JX800/JX802 daily; JX804 daily via equipment split (A359 days{1,2}, A351 x12 rest-of-week); 3rd daily explicitly 2026-12-01..2027-02-28."},
  {"carrier":"CX","pair":["HKG","LHR"],"daysOfWeek":[2,3,4,5,6],"flightNumbers":["CX239"],"effectiveFrom":"2026-04-02","effectiveUntil":"2026-04-30","status":"seasonal","confidence":"community-corrected","sourceUrls":["https://www.aeroroutes.com/eng/260320-cxapr26eu"],"notes":"EXTRA sections only (route raised 32->35 weekly): CX239 HKG->LHR 77W rotation days{2,4,6} + A359 rotation days{3,5}; base 32-weekly coverage NOT day-pinned; CX256 rows are the LHR->HKG return."}
]
```

### (d) Budget + honesty ledger

Origin/live/replay: 11 budgeted fetches OK + 1 disclosed failed call = 12 vs cap ~12:
1. live aeroroutes 260419-cxmay26 → 200 (202,913 B)
2. live aeroroutes 260320-cxapr26eu → 200 (198,542 B)
3. WB replay 20190822115248 CI timetable.html (112,244 B) OK — negative (form shell)
4. WB replay 20151214215604 CI timetable (66,293 B) OK — negative (form shell) + PDF link lead
5. live aeroroutes 260114-jxapr26kix → 200 (209,536 B)
6. live aeroroutes 251229-brns26sfo → 200 (215,718 B)
7. WB replay 20250319152449id_ CI timetable PDF (1,843,009 B) OK — GOLD
8. live aeroroutes 260730-jxnw26nrt → 200 (275,151 B)
9. live aeroroutes /eng/category/NS26 discovery page → 200 (234,578 B)
10. WB replay 20130330002950id_ EVA pdf-timetables page (59,399 B) OK — negative (nav shell)
11. live evaair.com 2026-05-26 schedule-adjustment notice → HTTP 403 FAILED (bot-block;
    error-only, no artifact) — overage disclosure #11
12. live aeroroutes 260414-br2q26hkg → 200 (230,128 B)

CDX API: exactly 6/6, ALL matchType=prefix, NO filter= param: (1) china-airlines.com domain
(5,000 rows, lexicographic truncation → motivated targeted follow-ups), (2)
china-airlines.com/eBooking/ (0 rows), (3) china-airlines.com/us/en/ (3,000 rows),
(4) china-airlines.com/english/ (0 rows), (5) china-airlines.com/us/en/Images/timetable
(51 rows → BOTH PDF captures found), (6) evaair.com/en-global/ (4,150 rows). Cached as
sc-cdx-ci-domain.txt, sc-cdx-ci-ebooking.txt, sc-cdx-ci-us-en.txt, sc-cdx-ci-english.txt,
sc-cdx-ci-pdf.txt, sc-cdx-br-englobal.txt.

Search plane (separate ledger): web_search 10 calls / ~34 delivered queries (1 call failed
HTTP 429 rate-limit, retried OK). Search snippets were used for DISCOVERY only; every JSON
entry above traces to a fetched-and-cached artifact, except the booking.evaair.com JS-app
characterization which is snippet-grade and lives in negatives, not entries. Tooling fetch
disclosed separately: python -m pip install pypdf (PyPI download for PDF text extraction).

Cache (%TEMP%\gcmp-research\, 22 sc-* files): sc-ci-wb-2025-timetable.pdf 1,843,009 B +
sc-ci-wb-2025-timetable.txt 97,550 B (pypdf text); sc-cdx-ci-domain.txt 774,742 B;
sc-cdx-br-englobal.txt 511,293 B; sc-aero-tag-br.html 260,596 B; sc-aero-cat-ns26.html
234,578 B; sc-aero-jx-nw26nrt.html 275,151 B; sc-aero-br-2q26hkg.html 230,128 B;
sc-aero-br-ns26sfo.html 215,718 B; sc-aero-jx-apr26kix.html 209,536 B; sc-aero-cx-may26.html
202,913 B; sc-aero-cx-apr26eu.html 198,542 B; sc-cdx-ci-us-en.txt 363,235 B;
sc-ci-wb-2019-timetable.html 112,244 B; sc-ci-wb-2015-timetable.html 66,293 B;
sc-br-wb-2013-pdftt-page.html 59,399 B; sc-cdx-ci-pdf.txt 5,664 B; two empty CDX dumps
(sc-cdx-ci-ebooking.txt, sc-cdx-ci-english.txt — 0-row results kept as evidence); extractor
scripts sc-extract-ci-pdf.py / sc-scan-ci-pdf.py / sc-dump-ci-pages.py.

Tooling lessons: piping a PowerShell helper through Out-Null swallows its diagnostic output
(silent fetch failures — print inside the caller instead); PS `-f` mangles Python %-formatting
(use `.Replace('PLACEHOLDER', value)`); Squarespace slug regexes must allow hyphens
(`[a-z0-9]+` silently misses slugs like 260114-jxapr26kix); aeroroutes `x12` = except-days
notation complementing bare-digit day lists; CDX domain-wide prefix dumps truncate
lexicographically — always follow with targeted subtree prefixes; CI PDF CJK text garbles
under the console codepage while ASCII (flights/times/days) extracts cleanly, so keyword
search should target flight numbers, not city names.

No quotes fabricated: every verbatim string above was re-read against local caches
immediately before writing; bracketed day-grid tokens like `[  23  5  7]` mark extracted digit
runs whose spacing is extraction noise (digit presence is the data). No code/data changes;
nothing committed; no Iron Rule test activates from A10; existing calib.* mechanisms
unaffected.

### (e) Suggested calib.* test ids (docs-only; none activated)

- calib.schedule.ci-tpe-hkg-six-daily-plus-921-2357-607-146 — window-scoped union = all 7 days.
- calib.schedule.ci-tpe-nrt-ci106-days-357 — sparse-frequency pin inside an otherwise-daily route.
- calib.schedule.ci-tpe-lax-ci008-daily-across-dst-subwindows.
- calib.schedule.br-tpe-sfo-three-daily-from-29mar26.
- calib.schedule.jx-tpe-nrt-split-rotation-still-daily — `359 12` + `351 x12` union = daily.
- calib.schedule.cx-hkg-lhr-extra-sections-days-23456 — extras-only semantics guard.
- calib.schedule.expired-window-no-findings — CI rows must yield no current-date warnings (S4).
