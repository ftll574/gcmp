#!/usr/bin/env python3
"""Parse one cached Avinor XML Public snapshot and exact-join OSL candidates.

Offline only: this program does not fetch network data. It preserves the raw
flightId, operating-airline IATA, arrival/departure direction, endpoint, and via
field. A populated via_airport blocks an endpoint-only match; a blank field
means only that this source reported no intermediate airport, not proof of a
physical nonstop service.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path

UTC = dt.timezone.utc


def parse_utc(raw: str) -> dt.datetime:
    value = raw.strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    parsed = dt.datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        raise ValueError(f"timestamp lacks timezone: {raw!r}")
    return parsed.astimezone(UTC)


def runtime_candidates(runtime: dict, captured_at: dt.datetime) -> tuple[list[dict], str]:
    """Read exact GCMP candidate keys without importing another repository script.

    Current snapshot-backed numbers are not reconsidered while their source is
    still fresh. After the source cutoff, they re-enter this snapshot's review
    cohort with their original candidate-source links.
    """
    source_cutoffs = {source.get("id"): source.get("freshUntilUTC") for source in runtime.get("sources", [])}
    rows = []
    for route in runtime.get("routes", []):
        carrier = route.get("carrier")
        pair = route.get("pair") or []
        if not carrier or len(pair) != 2 or "OSL" not in pair:
            continue
        origin, destination = pair
        identity = route.get("carrierEntityKey") or carrier
        values = [(number, route.get("flightNumberCandidateSourceIds") or [])
                  for number in route.get("flightNumberCandidates") or []]
        for evidence in route.get("timeBoundFlightNumbers") or []:
            cutoff = source_cutoffs.get(evidence.get("sourceId"))
            if cutoff and captured_at < parse_utc(cutoff):
                continue
            values.append((evidence.get("flightNumber"), evidence.get("candidateSourceIds") or []))
        for number, source_ids in values:
            if not number or not source_ids:
                continue
            rows.append({
                "key": f"{carrier}|{identity}|{origin}>{destination}|{number}",
                "carrierEntityKey": identity,
                "carrierCode": carrier,
                "direction": [origin, destination],
                "flightDesignator": number,
                "candidateSourceIds": sorted(set(source_ids)),
                "carrierIdentity": route.get("carrierIdentity"),
                "service": route.get("service"),
                "effectiveFrom": route.get("effectiveFrom"),
                "effectiveUntil": route.get("effectiveUntil"),
            })
    rows.sort(key=lambda row: row["key"])
    digest = hashlib.sha256("".join(
        json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n" for row in rows
    ).encode("utf-8")).hexdigest()
    return rows, digest


def split_semicolon(raw: str) -> list[str]:
    return [part.strip() for part in raw.split(";")] if raw else []


def parse_codeshares(flight: ET.Element) -> list[dict[str, str]]:
    codes = split_semicolon(flight.findtext("codeshareAirlineDesignators") or "")
    numbers = split_semicolon(flight.findtext("codeshareFlightNumbers") or "")
    suffix_raw = flight.findtext("codeshareOperationalSuffixs") or ""
    suffixes = split_semicolon(suffix_raw) if suffix_raw else [""] * len(codes)
    if not codes or len(codes) != len(numbers) or len(codes) != len(suffixes):
        return []
    return [
        {"carrierCode": code, "number": number, "suffix": suffix, "designator": code + number + suffix}
        for code, number, suffix in zip(codes, numbers, suffixes)
        if code and number
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--snapshot", type=Path, default=Path(__file__).with_name("osl-public.xml"))
    ap.add_argument("--metadata", type=Path, default=Path(__file__).with_name("request-metadata.json"))
    ap.add_argument("--runtime", type=Path, required=True, help="read-only runtime-current.json from isolated GCMP checkout")
    ap.add_argument("--output-dir", type=Path, default=Path("/tmp") / f"avinor-osl-parse-{dt.datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}")
    args = ap.parse_args()

    raw = args.snapshot.read_bytes()
    if re.search(rb"<!\s*(DOCTYPE|ENTITY)\b", raw, re.I):
        raise ValueError("DTD/entity declarations are not accepted in the XML snapshot")
    meta = json.loads(args.metadata.read_text(encoding="utf-8"))
    if meta.get("httpStatus") != 200 or not str(meta.get("contentType", "")).lower().startswith("application/xml"):
        raise ValueError("metadata does not describe a successful XML Public response")
    raw_sha = hashlib.sha256(raw).hexdigest()
    if raw_sha != meta.get("responseSHA256") or len(raw) != meta.get("responseBytes"):
        raise ValueError("snapshot bytes differ from the saved retrieval hash/length")
    captured_at = parse_utc(meta["retrievedAtUTC"])
    window_start = captured_at - dt.timedelta(hours=1)
    window_end = captured_at + dt.timedelta(hours=144)

    root = ET.fromstring(raw)
    if root.tag != "airport" or root.attrib.get("name") != "OSL":
        raise ValueError("snapshot root is not the documented OSL airport response")
    flights_node = root.find("flights")
    if flights_node is None:
        raise ValueError("OSL response lacks its flights element")
    feed_last_update = flights_node.attrib.get("lastUpdate", "")

    runtime = json.loads(args.runtime.read_text(encoding="utf-8"))
    candidate_rows, candidate_digest = runtime_candidates(runtime, captured_at)
    candidate_by_route = defaultdict(list)
    runtime_route_by_pair = {}
    for route in runtime.get("routes", []):
        if route.get("flightNumberCandidates"):
            runtime_route_by_pair[(route.get("carrier"), tuple(route.get("pair") or []))] = route
    for candidate in candidate_rows:
        origin, destination = candidate["direction"]
        if origin == "OSL" or destination == "OSL":
            triple = (candidate["carrierCode"], origin, destination, candidate["flightDesignator"])
            route = runtime_route_by_pair.get((candidate["carrierCode"], (origin, destination)), {})
            candidate_by_route[triple].append({
                "key": candidate["key"],
                "carrierEntityKey": candidate["carrierEntityKey"],
                "carrierCode": candidate["carrierCode"],
                "origin": origin,
                "destination": destination,
                "flightDesignator": candidate["flightDesignator"],
                "candidateSourceIds": candidate["candidateSourceIds"],
                "carrierIdentity": route.get("carrierIdentity"),
                "service": route.get("service"),
                "effectiveFrom": route.get("effectiveFrom"),
                "effectiveUntil": route.get("effectiveUntil"),
            })
    candidate_count = sum(len(v) for v in candidate_by_route.values())

    rows = []
    row_parse_errors = []
    for index, flight in enumerate(flights_node.findall("flight"), start=1):
        def value(tag: str) -> str:
            return (flight.findtext(tag) or "").strip()
        airline = value("airline")
        flight_id = value("flight_id")
        direction_code = value("arr_dep")
        endpoint = value("airport")
        scheduled_raw = value("schedule_time")
        if direction_code == "D":
            origin, destination = "OSL", endpoint
        elif direction_code == "A":
            origin, destination = endpoint, "OSL"
        else:
            origin, destination = "", ""
        via_raw = value("via_airport")
        via = [part.strip() for part in via_raw.split(",") if part.strip()]
        status = flight.find("status")
        status_code = status.attrib.get("code", "").strip() if status is not None else ""
        status_time = status.attrib.get("time", "").strip() if status is not None else ""
        schedule_dt = None
        try:
            schedule_dt = parse_utc(scheduled_raw)
        except (ValueError, TypeError):
            row_parse_errors.append({"sourceRow":index,"uniqueId":flight.attrib.get("uniqueID"),"field":"schedule_time","raw":scheduled_raw})
        prefix_consistent = bool(airline and flight_id.startswith(airline) and len(flight_id) > len(airline))
        row = {
            "sourceRow": index,
            "uniqueId": flight.attrib.get("uniqueID"),
            "operatingCarrierIATA": airline,
            "flightIdRaw": flight_id,
            "flightIdStartsWithOperatingIATA": prefix_consistent,
            "domesticInternationalRaw": value("dom_int"),
            "arrDepRaw": direction_code,
            "direction": "departure" if direction_code == "D" else "arrival" if direction_code == "A" else "unknown",
            "airportParameter": "OSL",
            "oppositeEndAirport": endpoint,
            "origin": origin,
            "destination": destination,
            "viaAirportRaw": via_raw,
            "viaAirports": via,
            "scheduleTimeRawUTC": scheduled_raw,
            "scheduleTimeUTC": schedule_dt.isoformat().replace("+00:00", "Z") if schedule_dt else None,
            "withinRequestedTimeEnvelope": bool(schedule_dt and window_start <= schedule_dt <= window_end),
            "upcomingAtCapture": bool(schedule_dt and captured_at <= schedule_dt <= window_end),
            "withinOneHourHistory": bool(schedule_dt and window_start <= schedule_dt < captured_at),
            "statusCode": status_code,
            "statusTimeUTC": status_time,
            "codeshares": parse_codeshares(flight),
        }
        rows.append(row)

    row_matches = defaultdict(list)
    via_endpoint_matches = defaultdict(list)
    canceled_matches = defaultdict(list)
    recent_operated_matches = defaultdict(list)
    codeshare_only_matches = defaultdict(list)
    for row in rows:
        if row["arrDepRaw"] not in {"A", "D"} or not row["origin"] or not row["destination"]:
            continue
        exact_route_key = (row["operatingCarrierIATA"], row["origin"], row["destination"], row["flightIdRaw"])
        candidates = candidate_by_route.get(exact_route_key, [])
        if row["flightIdStartsWithOperatingIATA"] and candidates and row["withinRequestedTimeEnvelope"]:
            for candidate in candidates:
                evidence = {
                    "candidateKey": candidate["key"],
                    "sourceRow": row["sourceRow"],
                    "sourceUniqueId": row["uniqueId"],
                    "operatingCarrierIATA": row["operatingCarrierIATA"],
                    "flightIdRaw": row["flightIdRaw"],
                    "flightIdStartsWithOperatingIATA": row["flightIdStartsWithOperatingIATA"],
                    "domesticInternationalRaw": row["domesticInternationalRaw"],
                    "origin": row["origin"],
                    "destination": row["destination"],
                    "scheduleTimeUTC": row["scheduleTimeUTC"],
                    "statusCode": row["statusCode"],
                    "statusTimeUTC": row["statusTimeUTC"],
                    "viaAirportRaw": row["viaAirportRaw"],
                    "viaAirports": row["viaAirports"],
                    "candidateCarrierIdentity": candidate["carrierIdentity"],
                    "candidateSourceIds": candidate["candidateSourceIds"],
                }
                if row["viaAirports"]:
                    via_endpoint_matches[candidate["key"]].append(evidence)
                    continue
                if row["statusCode"] == "C":
                    canceled_matches[candidate["key"]].append(evidence)
                elif row["upcomingAtCapture"]:
                    row_matches[candidate["key"]].append({**evidence,"observationClass":"upcoming-scheduled-row"})
                elif row["withinOneHourHistory"] and row["statusCode"] in {"D","A"}:
                    recent_operated_matches[candidate["key"]].append({**evidence,"observationClass":"recent-status-departed-or-arrived"})
        # Diagnostic only: a source-listed codeshare alias is never substituted
        # for the OperatingAirlineIata + FlightId pair above.
        if row["withinRequestedTimeEnvelope"] and row["upcomingAtCapture"] and row["statusCode"] != "C" and not row["viaAirports"]:
            for cs in row["codeshares"]:
                cs_key = (cs["carrierCode"], row["origin"], row["destination"], cs["designator"])
                for candidate in candidate_by_route.get(cs_key, []):
                    if candidate["carrierCode"] != row["operatingCarrierIATA"] or cs["designator"] != row["flightIdRaw"]:
                        codeshare_only_matches[candidate["key"]].append({
                            "candidateKey":candidate["key"],"sourceRow":row["sourceRow"],"sourceUniqueId":row["uniqueId"],
                            "candidateMarketingOrListedCode":cs["carrierCode"],"candidateDesignator":cs["designator"],
                            "operatingCarrierIATA":row["operatingCarrierIATA"],"operatingFlightId":row["flightIdRaw"],
                            "origin":row["origin"],"destination":row["destination"],"scheduleTimeUTC":row["scheduleTimeUTC"],
                            "claimLimit":"Codeshare-only diagnostic; not an exact operating-carrier match and not counted as supported candidate evidence."
                        })

    supported_by_key = defaultdict(list)
    for key, values in row_matches.items(): supported_by_key[key].extend(values)
    for key, values in recent_operated_matches.items(): supported_by_key[key].extend(values)
    supported_rows = [
        {"candidateKey": key, "supportingSourceRows": values,
         "evidenceClass": "recently-operated" if key in recent_operated_matches else "upcoming-schedule",
         "candidateSourceIds": next((c["candidateSourceIds"] for c in sum(candidate_by_route.values(),[]) if c["key"]==key),[])}
        for key, values in sorted(supported_by_key.items())
    ]
    all_candidates = []
    for grouped in candidate_by_route.values():
        for c in grouped:
            k=c["key"]
            if k in supported_by_key: assessment="supported-exact-operating-code-number-directed-route"
            elif k in via_endpoint_matches: assessment="exact-operating-id-and-endpoint-but-via-airport-present-withheld-from-direct-route-match"
            elif k in canceled_matches: assessment="exact-direct-operating-match-but-cancelled-in-feed-window"
            elif k in codeshare_only_matches: assessment="codeshare-only-operating-code-differs-not-counted"
            else: assessment="no-exact-operating-match-in-this-snapshot"
            all_candidates.append({**c,"snapshotAssessment":assessment,
              "supportingSourceRows":supported_by_key.get(k,[]),
              "viaEndpointRowsWithheld":via_endpoint_matches.get(k,[]),
              "cancelledRows":canceled_matches.get(k,[]),
              "codeshareOnlyRows":codeshare_only_matches.get(k,[])})
    all_candidates.sort(key=lambda x:x["key"])

    args.output_dir.mkdir(parents=True, exist_ok=True)
    def jsonl_write(path: Path, values):
        path.write_text("".join(json.dumps(x,ensure_ascii=False,sort_keys=True,separators=(",",":"))+"\n" for x in values),encoding="utf-8")
    jsonl_write(args.output_dir/"parsed-osl-flights.jsonl",rows)
    jsonl_write(args.output_dir/"candidate-review.jsonl",all_candidates)
    jsonl_write(args.output_dir/"supported-candidate-associations.jsonl",supported_rows)
    counts=Counter({})
    for row in rows:
        counts["arrivalRows" if row["arrDepRaw"]=="A" else "departureRows" if row["arrDepRaw"]=="D" else "unknownDirectionRows"]+=1
        if row["viaAirports"]: counts["rowsWithViaAirport"]+=1
        if row["upcomingAtCapture"]: counts["upcomingRows"]+=1
        if row["withinOneHourHistory"]: counts["rowsInOneHourHistory"]+=1
        if row["statusCode"]: counts["rowsWithStatus"]+=1
        if row["statusCode"]=="C": counts["cancelledRows"]+=1
        if row["flightIdStartsWithOperatingIATA"]: counts["flightIdPrefixMatchesOperatingIATA"]+=1
        if not row["withinRequestedTimeEnvelope"]: counts["scheduleTimeOutsideRequestEnvelope"]+=1
    matched_routes={(x["carrierCode"],x["origin"],x["destination"]) for x in all_candidates if x["snapshotAssessment"]=="supported-exact-operating-code-number-directed-route"}
    existing_confirmed=[]
    for key in supported_by_key:
        c=next(c for group in candidate_by_route.values() for c in group if c["key"]==key)
        for route in runtime.get("routes",[]):
            if route.get("carrier")==c["carrierCode"] and route.get("pair")==[c["origin"],c["destination"]] and c["flightDesignator"] in (route.get("flightNumbers") or []):
                existing_confirmed.append(key)
    # Build an in-memory review patch only. The runtime file is read and hashed
    # above; it is never written by this script.
    matched_by_route = defaultdict(set)
    for candidate in all_candidates:
        if candidate["snapshotAssessment"] == "supported-exact-operating-code-number-directed-route":
            matched_by_route[(candidate["carrierCode"], (candidate["origin"], candidate["destination"]))].add(candidate["flightDesignator"])
    current_source_id = f"avinor-xml-public-osl-{captured_at.strftime('%Y%m%d-%H%M%S')}"
    fresh_until = (captured_at + dt.timedelta(hours=144)).isoformat().replace("+00:00", "Z")
    candidate_route_map = {}
    for route in runtime.get("routes", []):
        if route.get("flightNumberCandidates") or route.get("timeBoundFlightNumbers"):
            candidate_route_map[(route.get("carrier"), tuple(route.get("pair") or []))] = route
    route_changes = []
    after_route_by_key = {}
    for route_key, designators in sorted(matched_by_route.items()):
        before_route = candidate_route_map[route_key]
        available = set(before_route.get("flightNumberCandidates") or []) | {
            item.get("flightNumber") for item in before_route.get("timeBoundFlightNumbers") or []
        }
        if not designators <= available:
            raise ValueError(f"matched designators are not candidates on route {route_key}")
        after_route = json.loads(json.dumps(before_route))
        after_route["flightNumbers"] = sorted(set(after_route.get("flightNumbers") or []) | designators)
        timed_rows = []
        for designator in sorted(designators):
            key = next(candidate["key"] for candidate in all_candidates
                       if candidate["snapshotAssessment"] == "supported-exact-operating-code-number-directed-route"
                       and (candidate["carrierCode"], (candidate["origin"], candidate["destination"])) == route_key
                       and candidate["flightDesignator"] == designator)
            candidate = next(candidate for candidate in all_candidates if candidate["key"] == key)
            upcoming_times = sorted({row["scheduleTimeUTC"] for row in supported_by_key[key]
                                     if row.get("observationClass") == "upcoming-scheduled-row"})
            timed_rows.append({
                "flightNumber": designator,
                "sourceId": current_source_id,
                "candidateSourceIds": candidate["candidateSourceIds"],
                "occurrencesUTC": upcoming_times,
            })
        after_route["timeBoundFlightNumbers"] = [
            item for item in after_route.get("timeBoundFlightNumbers") or []
            if item.get("flightNumber") not in designators
        ] + timed_rows
        after_route["sourceIds"] = sorted(set(after_route.get("sourceIds") or []) | {current_source_id})
        remaining = sorted(set(after_route.get("flightNumberCandidates") or []) - designators)
        if remaining:
            after_route["flightNumberCandidates"] = remaining
        else:
            after_route.pop("flightNumberCandidates", None)
            after_route.pop("flightNumberCandidateSourceIds", None)
        after_route_by_key[route_key] = after_route
        route_keys = sorted(
            candidate["key"] for candidate in all_candidates
            if candidate["snapshotAssessment"] == "supported-exact-operating-code-number-directed-route"
            and (candidate["carrierCode"], (candidate["origin"], candidate["destination"])) == route_key
        )
        route_changes.append({
            "before": before_route,
            "after": after_route,
            "addedAssociations": route_keys,
            "newlyConfirmedDesignators": sorted(designators),
            "unmatchedCandidateDesignatorsRetained": remaining,
            "claimLimit": f"Exact operating-code/designator route association from a current public flight feed within this six-day OSL capture; fresh only until {fresh_until}. This does not establish recurring service beyond the captured feed window, award inventory, or bookability.",
        })
    after_routes = [
        after_route_by_key.get((r.get("carrier"), tuple(r.get("pair") or [])), r)
        for r in runtime.get("routes", [])
    ]
    def tier_totals(field: str, route_list: list[dict]) -> dict:
        selected = [r for r in route_list if r.get(field)]
        numbers = [number for r in selected for number in r[field]]
        result = {"associationKeys": len(numbers), "distinctDesignators": len(set(numbers)), "directedRouteIdentities": len(selected)}
        if field == "flightNumbers":
            result["designatorCarrierIdentityCounts"] = dict(sorted(Counter(
                {identity: sum(len(r[field]) for r in selected if r.get("carrierIdentity", "unknown") == identity)
                 for identity in {r.get("carrierIdentity", "unknown") for r in selected}}
            ).items()))
        return result
    totals_before = {"confirmed": tier_totals("flightNumbers", runtime.get("routes", [])), "candidate": tier_totals("flightNumberCandidates", runtime.get("routes", []))}
    totals_after = {"confirmed": tier_totals("flightNumbers", after_routes), "candidate": tier_totals("flightNumberCandidates", after_routes)}
    delta = {
        "confirmedAssociationKeys": totals_after["confirmed"]["associationKeys"] - totals_before["confirmed"]["associationKeys"],
        "confirmedDistinctDesignators": totals_after["confirmed"]["distinctDesignators"] - totals_before["confirmed"]["distinctDesignators"],
        "confirmedDirectedRouteIdentities": totals_after["confirmed"]["directedRouteIdentities"] - totals_before["confirmed"]["directedRouteIdentities"],
        "candidateAssociationKeys": totals_after["candidate"]["associationKeys"] - totals_before["candidate"]["associationKeys"],
        "candidateDistinctDesignators": totals_after["candidate"]["distinctDesignators"] - totals_before["candidate"]["distinctDesignators"],
        "candidateDirectedRouteIdentities": totals_after["candidate"]["directedRouteIdentities"] - totals_before["candidate"]["directedRouteIdentities"],
    }
    candidate_windows = Counter()
    for c in all_candidates:
        if c["snapshotAssessment"] != "supported-exact-operating-code-number-directed-route":
            continue
        start, end = c.get("effectiveFrom"), c.get("effectiveUntil")
        day = captured_at.date().isoformat()
        if not start and not end: state = "unknown"
        elif start and day < start: state = "future"
        elif end and day > end: state = "expired"
        elif start and end and start <= day <= end: state = "active"
        else: state = "partial-or-unparseable"
        candidate_windows[state] += 1
    supported_associations = []
    for candidate in all_candidates:
        if candidate["snapshotAssessment"] != "supported-exact-operating-code-number-directed-route":
            continue
        supported_associations.append({
            "candidateKey": candidate["key"],
            "carrierEntityKey": candidate["carrierEntityKey"],
            "carrierCode": candidate["carrierCode"],
            "direction": [candidate["origin"], candidate["destination"]],
            "flightDesignator": candidate["flightDesignator"],
            "candidateSourceIds": candidate["candidateSourceIds"],
            "candidateCarrierIdentityBefore": candidate["carrierIdentity"],
            "runtimeValidityAtCaptureDate": "active" if candidate.get("effectiveFrom") and candidate.get("effectiveUntil") and candidate["effectiveFrom"] <= captured_at.date().isoformat() <= candidate["effectiveUntil"] else "unknown-or-outside-explicit-window",
            "sourceRows": candidate["supportingSourceRows"],
        })
    patch = {
        "kind": "gcmp-flight-number-confirmed-review-patch",
        "status": "proposed-not-applied",
        "noRuntimeMutation": True,
        "baseRuntimeSHA256": hashlib.sha256(args.runtime.read_bytes()).hexdigest(),
        "sourceRecordToAdd": {
            "id": current_source_id,
            "checkedOn": captured_at.date().isoformat(),
            "url": meta["endpoint"],
            "freshUntilUTC": fresh_until,
            "note": f"One bounded OSL XML Public snapshot (TimeFrom=1, TimeTo=144, both directions, codeshare=Y), retrieved {captured_at.isoformat().replace('+00:00', 'Z')}. Exact matches to Avinor's OperatingAirlineIata, full FlightId and direction fields with upcoming schedule_time only; stale after {fresh_until}. Blank via_airport means no intermediate airport was reported by this source, not proof of physical nonstop service. A schedule row does not prove actual operation, recurrence or bookability. Source terms require visible linked 'Flight data from Avinor' attribution to https://www.avinor.no/.",
        },
        "sourceCapture": {"url": meta["requestUrl"], "httpStatus": meta["httpStatus"], "retrievedAtUTC": captured_at.isoformat().replace("+00:00", "Z"), "rawResponseBytes": len(raw), "rawResponseSHA256": raw_sha, "sourceRows": len(rows), "feedLastUpdateUTC": feed_last_update},
        "reviewCohort": {"runtimeCandidateAssociationsWithOSLEndpoint": candidate_count, "exactOperatingScheduleAssociations": len(supported_by_key), "directedRoutes": len(matched_by_route), "pendingOrExcludedCodeshareOnlyKeys": len(codeshare_only_matches)},
        "additions": supported_associations,
        "proposedRouteChanges": route_changes,
        "runtimeBefore": totals_before,
        "runtimeAfterProposedPatch": totals_after,
        "runtimeDelta": delta,
        "identitySemantics": {"operatingCarrierField": "airline (OperatingAirlineIata); this supports the source-listed scheduled operating-carrier identity, not proof of actual operation", "flightIdRequirement": "flight_id begins with that same airline code and is compared in full exactly", "direction": "arr_dep D means OSL to opposite airport; A means opposite airport to OSL", "via": "Rows with nonempty via_airport are withheld; a blank via_airport only means this source reported no intermediate airport and does not prove physical nonstop service", "codeshare": "Codeshare-only candidates are diagnostic and are excluded from additions."},
    }
    (args.output_dir/"dry-run-promotion-patch.json").write_text(json.dumps(patch,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    report={
      "kind":"avinor-xml-public-osl-candidate-review",
      "snapshot":{"path":args.snapshot.name,"bytes":len(raw),"sha256":raw_sha,"httpStatus":meta["httpStatus"],"retrievedAtUTC":captured_at.isoformat().replace("+00:00","Z"),"feedLastUpdateUTC":feed_last_update,"airport":root.attrib["name"],"contentType":meta["contentType"],"requestUrl":meta["requestUrl"],"noRedirectsOrRetries":True},
      "requestScope":{"airport":"OSL","TimeFromHours":1,"TimeToHours":144,"direction":"both","codeshare":"Y","maximumForwardWindowHours":144,"xmlPublicRequests":1},
      "parser":{"xmlFlightRows":len(rows),"rowsIndexed":len(rows),"parseErrors":row_parse_errors,"counts":dict(sorted(counts.items())),"schemaFieldsUsed":["airline","flight_id","schedule_time","arr_dep","airport","via_airport","status","codeshareAirlineDesignators","codeshareFlightNumbers","codeshareOperationalSuffixs"]},
      "candidateScope":{"runtimePath":str(args.runtime.resolve()),"runtimeSHA256":hashlib.sha256(args.runtime.read_bytes()).hexdigest(),"candidateDigest":candidate_digest,"allRuntimeCandidates":len(candidate_rows),"candidateAssociationsWithOSLEndpoint":candidate_count,"directedCandidateRoutesWithOSLEndpoint":len({(c["carrierCode"],c["origin"],c["destination"]) for cs in candidate_by_route.values() for c in cs}),"supportedMatchRuntimeWindowCounts":dict(sorted(candidate_windows.items()))},
      "matchCounts":{"supportedExactOperatingAssociationKeys":len(supported_by_key),"upcomingScheduleAssociationKeys":len(row_matches),"recentlyOperatedAssociationKeys":len(recent_operated_matches),"supportedDirectedRoutes":len(matched_routes),"viaEndpointMatchesWithheld":len(via_endpoint_matches),"cancelledExactDirectKeysWithheld":len(canceled_matches),"codeshareOnlyKeysDiagnosticNotCounted":len(codeshare_only_matches),"overlapWithExistingConfirmed":len(existing_confirmed)},
      "dryRun":{"status":"proposed-not-applied","runtimeBefore":totals_before,"runtimeAfter":totals_after,"delta":delta,"patch":"dry-run-promotion-patch.json"},
      "identitySemantics":{"operatingCarrierField":"XmlFeed airline is documented as OperatingAirlineIata; this supports scheduled operating-carrier identity but not proof of actual operation.","flightIdentifier":"Avinor FlightId is normally operating IATA + FlightNumber + suffix but may use ICAO airline code in some cases; exact match requires flight_id to start with the XML airline IATA. Rows that do not satisfy this are not exact matches.","marketingCodeshares":"codeshare aliases are retained as diagnostics only and never substituted for operating code/number.","direction":"D means OSL→airport; A means airport→OSL.","viaAirport":"A populated via_airport causes rows to be withheld; blank means this source reported no intermediate airport and does not prove physical nonstop service.","time":"schedule_time is UTC; upcoming matches are limited to response time through response time +144h. Recent actual status D/A in the one-hour lookback is reported separately."},
      "sourceTerms":{"reuse":"The official terms require visible linked attribution text 'Flight data from Avinor' to point to https://www.avinor.no/ and appear near the data; contact before heavy server load.","attributionText":"Flight data from Avinor","attributionURL":"https://www.avinor.no/","termsURL":"https://partner.avinor.no/en/services/flight-data/","requestLoad":"One OSL XML Public query only; no retries; no other airports."},
      "robotsProbe":meta.get("robotstxtProbe", {"result":"not probed; no robots policy inferred"}),
      "artifacts":{"parsedRows":"parsed-osl-flights.jsonl","candidateReview":"candidate-review.jsonl","supportedAssociations":"supported-candidate-associations.jsonl","dryRunPatch":"dry-run-promotion-patch.json","rawXML":args.snapshot.name,"responseHeaders":"osl-public.headers","retrievalMetadata":args.metadata.name},
      "runtimeMutationApplied":False,
    }
    (args.output_dir/"report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    print(json.dumps({'rows':len(rows),'OSLCandidates':candidate_count,'matchCounts':report['matchCounts'],'dryRunDelta':delta,'report':str(args.output_dir/'report.json')},ensure_ascii=False,indent=2))
    return 0

if __name__=='__main__':
    raise SystemExit(main())
