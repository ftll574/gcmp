# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inferred from the explicit product brief and current product docs: Taiwan-based award travelers planning complex round-the-world or multi-carrier mileage-redemption itineraries.

## Product Purpose

GCMP helps travelers compose an itinerary, understand whether it fits supported award-ticket rules, inspect route evidence, and share the plan. Success means a traveler can make and verify a plausible route plan while seeing what remains unknown.

## Positioning

It combines route composition, program-specific RTW validation, sourced route evidence, and shareable routing in one Taiwan-first planner. It distinguishes airport-pair observations from schedules and award-seat availability.

## Operating Context

Inferred: users compare alliance award products, add physical flight legs and surface sectors, inspect map context and rule findings, adjust leg-level carrier/cabin/date details, then save or share a URL.

## Capabilities and Constraints

The published main branch contains a React/Vite web app, a shareable hash-based itinerary schema, airport and route discovery, great-circle map, award-rule validation, mileage estimates, schedule references, and Traditional Chinese/English localization. Preserve the existing planner rules, carrier qualification, route provenance, evidence distinctions, loading behavior, and URL round-tripping. Route-only evidence must not imply schedules, seats, or RTW eligibility. Do not alter route datasets in this redesign.

## Evidence on Hand

The UI and local bundled data are the product evidence. No award-seat inventory, live schedules, or global route completeness claim is available to fabricate. Existing labels and source links are authoritative for their represented claims.

## Product Principles

- Make itinerary composition the central task.
- Keep rule outcomes and evidence provenance legible.
- Treat unknown and partial information honestly.
- Preserve shareability and existing product semantics.
- Keep the planner usable on desktop and mobile.
- Keep development progress and global research counters out of the public interface; show source limits beside the route they qualify.
