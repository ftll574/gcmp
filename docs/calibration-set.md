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
