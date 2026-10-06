#!/usr/bin/env python3
"""Build the dated, source-listed CAA weekly-schedule reference asset.

The builder verifies the complete original CAA CSV snapshots and joins them to
the pinned runtime candidate keys. It does not modify runtime-current.json or
the operator-confirmed flight-number tier.
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "artifacts/flight-evidence-verifier/caa-source-bytes-20261006"
OUT = ROOT / "public/data/route-network/caa-weekly-schedule-tier-20261006.json"
BUILD_REPORT = ROOT / "artifacts/flight-evidence-verifier/caa-source-bytes-20261006/runtime-tier-build.json"
AS_OF = dt.date(2026, 10, 6)
EXPECTED_CANDIDATE_MANIFEST_SHA256 = "cac4e065b0e7d663aa321c1b9b4a0204d44f42758e0ed92dae5a3446ce81b66a"
EXPECTED_CANDIDATE_KEY_SET_SHA256 = "1b337e0fee9c5159675a7f91b57ca1b796bde1fb7eb85e2afa2ab8fecef5fdaa"
EXPECTED_RUNTIME_SHA256 = "2bd353350db6d871099a2c2aa2aee23b63b0a7e65cccbbc502d9234eeb017c8a"

SOURCES = {
    "6066": {
        "sourceId": "caa-ogdl-6066-20261001",
        "kind": "domestic",
        "path": BASE / "GET_SCHE_PUB_DOM_294_104211.csv",
        "url": "https://www.caa.gov.tw/FileAtt.ashx?id=16680&lang=1",
        "hashPageUrl": "https://www.caa.gov.tw/FileHashValue.aspx?a=294&fn=%E5%9C%8B%E5%85%A7%E5%AE%9A%E6%9C%9F%E8%88%AA%E7%B7%9A%E7%8F%AD%E6%A9%9F%E6%99%82%E5%88%BB%E8%A1%A8&lang=1",
        "datasetUrl": "https://data.gov.tw/dataset/6066",
        "sha256": "5690304d65a8a0a62df920d8cf16227654674b34fff2a44f064f79d587286ea2",
        "bytes": 130505,
        "title": "2026 Domestic Scheduled Timetable",
    },
    "9973": {
        "sourceId": "caa-ogdl-9973-20261001",
        "kind": "international",
        "path": BASE / "GET_SCHE_PUBLIC_294_103521.csv",
        "url": "https://www.caa.gov.tw/FileAtt.ashx?id=16679&lang=1",
        "hashPageUrl": "https://www.caa.gov.tw/FileHashValue.aspx?a=294&fn=%E5%9C%8B%E9%9A%9B%E5%8F%8A%E5%85%A9%E5%B2%B8%E5%AE%9A%E6%9C%9F%E5%AE%A2%E9%81%8B%E7%8F%AD%E8%A1%A8&lang=1",
        "datasetUrl": "https://data.gov.tw/dataset/9973",
        "sha256": "ebfd2e8f207a46f250fe48c53b53770d10a1fec342a18a73e19f349574bb0f35",
        "bytes": 133668,
        "title": "2026 International and Cross-Strait Scheduled Passenger Timetable",
    },
}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_date(value: str) -> dt.date:
    return dt.date.fromisoformat(value.strip().replace("/", "-"))


def active_weekly_row(row: dict[str, str]) -> bool:
    start = source_date(row["ScheduleStartDate"])
    end = source_date(row["ScheduleEndDate"])
    if not start <= AS_OF <= end:
        return False
    mask = row["WeekDay"].strip()
    if len(mask) != 7 or not mask.isdigit():
        raise ValueError(f"Invalid weekday mask: {mask!r}")
    span = (end - start).days
    return any(value != "0" and (index - start.isoweekday()) % 7 <= span for index, value in enumerate(mask, 1))


def parse_days(mask: str) -> list[int]:
    if len(mask) != 7 or not mask.isdigit():
        raise ValueError(f"Invalid weekday mask: {mask!r}")
    return [index for index, value in enumerate(mask, 1) if value != "0"]


def parse_clock(raw: str) -> tuple[str, int | None]:
    value = raw.strip()
    if not re.fullmatch(r"\d{4}(?:\+[0-9])?", value):
        raise ValueError(f"Unsupported CAA clock value: {value!r}")
    clock = f"{value[:2]}:{value[2:4]}"
    dt.time.fromisoformat(clock)
    return clock, int(value[5:]) if len(value) > 4 else None


def row_key(row: dict[str, str]) -> str:
    carrier = row["Airline"].strip()
    flight = row["FlightNumber"].strip()
    from_airport = row["DepartureAirport"].strip()
    to_airport = row["ArrivalAirport"].strip()
    return f"{carrier}|{carrier}|{from_airport}>{to_airport}|{flight}"


def weekday_occurs(mask: str, start: dt.date, end: dt.date) -> bool:
    if len(mask) != 7 or not mask.isdigit():
        raise ValueError(f"Invalid CAA weekday mask: {mask!r}")
    span = (end - start).days
    return any(value != "0" and (index - start.isoweekday()) % 7 <= span for index, value in enumerate(mask, 1))


def conflict_line_numbers(rows: list[dict[str, Any]]) -> set[tuple[str, int]]:
    conflicts: set[tuple[str, int]] = set()
    for index, left in enumerate(rows):
        for right in rows[index + 1:]:
            start = max(source_date(left["ScheduleStartDate"]), source_date(right["ScheduleStartDate"]))
            end = min(source_date(left["ScheduleEndDate"]), source_date(right["ScheduleEndDate"]))
            if start > end:
                continue
            common_days = set(parse_days(left["WeekDay"].strip())) & set(parse_days(right["WeekDay"].strip()))
            if any(weekday_occurs("".join(str(position) if position == day else "0" for position in range(1, 8)), start, end) for day in common_days):
                if (left["DepartureDateTime"].strip(), left["ArrivalDateTime"].strip()) != (right["DepartureDateTime"].strip(), right["ArrivalDateTime"].strip()):
                    conflicts.add((left["datasetId"], left["lineNumber"]))
                    conflicts.add((right["datasetId"], right["lineNumber"]))
    return conflicts


def candidate_keys_from_runtime(runtime: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for route in runtime["routes"]:
        carrier = route["carrier"]
        entity = route.get("carrierEntityKey", carrier)
        from_airport, to_airport = route["pair"]
        for designator in route.get("flightNumberCandidates", []):
            key = f"{entity}|{carrier}|{from_airport}>{to_airport}|{designator}"
            if key in keys:
                raise ValueError(f"Duplicate runtime candidate association key: {key}")
            keys.add(key)
    return keys


def schedule_signature(row: dict[str, Any]) -> tuple[str, ...]:
    return (
        row["WeekDay"].strip(), row["DepartureDateTime"].strip(), row["ArrivalDateTime"].strip(),
        row.get("CodeShareInfo", "").strip(),
        *(row.get(f"TransitAirport_{index}", "").strip() for index in range(1, 6)),
    )


def merge_current_schedule_rows(
    rows: list[dict[str, Any]],
    dataset_id: str,
    eligible_signatures: set[tuple[str, ...]],
    conflicted_lines: set[tuple[str, int]],
) -> list[dict[str, Any]]:
    """Join adjacent current/future weekly records with the same schedule fields."""
    by_signature: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        if row["datasetId"] != dataset_id:
            continue
        signature = schedule_signature(row)
        if signature not in eligible_signatures:
            continue
        by_signature[signature].append(row)

    periods: list[dict[str, Any]] = []
    for signature, source_rows in sorted(by_signature.items()):
        source_rows.sort(key=lambda row: (source_date(row["ScheduleStartDate"]), source_date(row["ScheduleEndDate"]), row["lineNumber"]))
        components: list[dict[str, Any]] = []
        for row in source_rows:
            start = source_date(row["ScheduleStartDate"])
            end = source_date(row["ScheduleEndDate"])
            if components and start <= components[-1]["until"] + dt.timedelta(days=1):
                component = components[-1]
                component["until"] = max(component["until"], end)
                component["lineNumbers"].append(row["lineNumber"])
            else:
                components.append({"from": start, "until": end, "lineNumbers": [row["lineNumber"]]})
        for component in components:
            if component["until"] < AS_OF or not weekday_occurs(signature[0], component["from"], component["until"]):
                continue
            current_or_future_start = max(component["from"], AS_OF)
            departure_clock, _ = parse_clock(signature[1])
            arrival_clock, arrival_offset = parse_clock(signature[2])
            transit = [value for value in signature[4:] if value]
            periods.append({
                "sourceId": SOURCES[dataset_id]["sourceId"],
                "sourceLineNumbers": sorted(set(component["lineNumbers"])),
                "status": "conflicting-window" if current_or_future_start > AS_OF and any((dataset_id, line) in conflicted_lines for line in component["lineNumbers"]) else "published-window",
                "validity": {"from": current_or_future_start.isoformat(), "until": component["until"].isoformat()},
                "weekdaysISO": parse_days(signature[0]),
                "weekdayMaskRaw": signature[0],
                "departureTimeRaw": signature[1],
                "arrivalTimeRaw": signature[2],
                "departureTimeDisplay": departure_clock,
                "arrivalTimeDisplay": arrival_clock,
                "arrivalDayOffset": arrival_offset,
                "timezone": "not-defined-by-source",
                "codeshareInfoRaw": signature[3],
                "reportedTransitAirports": transit,
                "nonstopConfirmed": False,
            })
    return sorted(periods, key=lambda period: (
        period["sourceId"], period["validity"]["from"], period["validity"]["until"],
        period["weekdaysISO"], period["departureTimeRaw"], period["arrivalTimeRaw"], period["codeshareInfoRaw"],
    ))


def main() -> None:
    if sha256_file(ROOT / "public/data/route-network/runtime-current.json") != EXPECTED_RUNTIME_SHA256:
        raise SystemExit("Pinned production runtime hash changed; refusing to build this tier")

    download_manifest = json.loads((BASE / "manifest.json").read_text(encoding="utf-8"))
    downloaded = {item["datasetId"]: item for item in download_manifest["items"]}
    for dataset_id, source in SOURCES.items():
        if sha256_file(source["path"]) != source["sha256"] or source["path"].stat().st_size != source["bytes"]:
            raise SystemExit(f"Original CAA snapshot integrity failure for dataset {dataset_id}")
        if downloaded[dataset_id]["actualSha256"] != source["sha256"] or downloaded[dataset_id]["actualBytes"] != source["bytes"]:
            raise SystemExit(f"CAA download manifest mismatch for dataset {dataset_id}")

    runtime = json.loads((ROOT / "public/data/route-network/runtime-current.json").read_text(encoding="utf-8"))
    candidate_keys = candidate_keys_from_runtime(runtime)
    candidate_key_set_sha256 = hashlib.sha256("".join(f"{key}\n" for key in sorted(candidate_keys)).encode("utf-8")).hexdigest()
    if len(candidate_keys) != 132_996 or candidate_key_set_sha256 != EXPECTED_CANDIDATE_KEY_SET_SHA256:
        raise SystemExit(f"Pinned runtime candidate association key set changed: {len(candidate_keys)} / {candidate_key_set_sha256}")
    confirmed_keys: set[str] = set()
    confirmed_designators: set[str] = set()
    confirmed_routes: set[str] = set()
    for route in runtime["routes"]:
        carrier = route["carrier"]
        entity = route.get("carrierEntityKey", carrier)
        from_airport, to_airport = route["pair"]
        for designator in route.get("flightNumbers", []):
            confirmed_keys.add(f"{entity}|{carrier}|{from_airport}>{to_airport}|{designator}")
            confirmed_designators.add(designator)
            confirmed_routes.add(f"{entity}|{carrier}|{from_airport}>{to_airport}")
    if (len(confirmed_keys), len(confirmed_designators), len(confirmed_routes)) != (839, 829, 295):
        raise SystemExit("Pinned runtime no longer has the expected operator-confirmed tier counts")
    exact_by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for dataset_id, source in SOURCES.items():
        with source["path"].open("r", encoding="utf-8-sig", newline="") as handle:
            for line_number, raw in enumerate(csv.DictReader(handle), start=2):
                key = row_key(raw)
                if key not in candidate_keys:
                    continue
                parsed_days = parse_days(raw["WeekDay"].strip())
                start = source_date(raw["ScheduleStartDate"])
                end = source_date(raw["ScheduleEndDate"])
                if start > end or not parsed_days:
                    raise ValueError(f"Invalid CAA date or weekday fields at {dataset_id}:{line_number}")
                parse_clock(raw["DepartureDateTime"])
                parse_clock(raw["ArrivalDateTime"])
                exact_by_key[key].append({"datasetId": dataset_id, "lineNumber": line_number, **raw})
    exact_source_rows = sum(len(rows) for rows in exact_by_key.values())
    if len(exact_by_key) != 540 or exact_source_rows != 2523:
        raise SystemExit(f"Unexpected exact CAA source intersection: {len(exact_by_key)} keys / {exact_source_rows} rows")

    associations: list[dict[str, Any]] = []
    active_weekly_count = 0
    conflict_count = 0
    for key, all_source_rows in sorted(exact_by_key.items()):
        entity, carrier, direction, flight = key.split("|")
        from_airport, to_airport = direction.split(">")
        if entity != carrier:
            # CAA lists an IATA carrier code only; never join it to an independently qualified entity.
            continue
        if not flight.startswith(carrier):
            raise SystemExit(f"Designator/carrier mismatch: {key}")
        active_rows = [row for row in all_source_rows if active_weekly_row(row)]
        if not active_rows:
            continue
        active_weekly_count += 1
        if conflict_line_numbers(active_rows):
            conflict_count += 1
            continue
        eligible_by_dataset: dict[str, set[tuple[str, ...]]] = defaultdict(set)
        for row in all_source_rows:
            validity_end = source_date(row["ScheduleEndDate"])
            if validity_end >= AS_OF and weekday_occurs(row["WeekDay"].strip(), source_date(row["ScheduleStartDate"]), validity_end):
                eligible_by_dataset[row["datasetId"]].add(schedule_signature(row))
        conflicted_lines = conflict_line_numbers(all_source_rows)
        windows = [
            window
            for dataset_id, signatures in eligible_by_dataset.items()
            for window in merge_current_schedule_rows(all_source_rows, dataset_id, signatures, conflicted_lines)
        ]
        if not windows:
            raise SystemExit(f"No active recurring source window for {key}")
        associations.append({
            "key": key,
            "carrier": carrier,
            "flightDesignator": flight,
            "from": from_airport,
            "to": to_airport,
            "tier": "schedule-verified-operator-unknown",
            "listedCarrierOnly": True,
            "operatingCarrier": None,
            "actualOperationConfirmed": False,
            "bookability": "unknown",
            "selectableOperatingService": False,
            "weeklyWindows": windows,
        })

    if active_weekly_count != 490 or conflict_count != 2:
        raise SystemExit(f"Unexpected CAA active weekly/conflict counts: {active_weekly_count}/{conflict_count}")

    associations.sort(key=lambda row: row["key"])
    if len({row["key"] for row in associations}) != 488:
        raise SystemExit("Duplicate schedule association keys")
    codes = {row["flightDesignator"] for row in associations}
    routes = {(row["carrier"], row["from"], row["to"]) for row in associations}
    schedule_keys = {row["key"] for row in associations}
    schedule_designators = {row["flightDesignator"] for row in associations}
    schedule_routes = {f"{row['carrier']}|{row['carrier']}|{row['from']}>{row['to']}" for row in associations}
    confirmed_overlap = schedule_keys & confirmed_keys
    if confirmed_overlap:
        raise SystemExit(f"CAA weekly schedule keys overlap the operator-confirmed tier: {sorted(confirmed_overlap)[:5]}")
    candidate_keys_outside_schedule = candidate_keys - schedule_keys
    if len(codes) != 483 or len(routes) != 253:
        raise SystemExit(f"Unexpected association/code/route counts: {len(associations)}/{len(codes)}/{len(routes)}")
    if any(not row["weeklyWindows"] for row in associations):
        raise SystemExit("Every schedule association must retain a weekly window")

    sources = []
    for dataset_id, source in SOURCES.items():
        item = downloaded[dataset_id]
        sources.append({
            "id": source["sourceId"],
            "datasetId": dataset_id,
            "kind": source["kind"],
            "title": source["title"],
            "attribution": "Taiwan Civil Aviation Administration (交通部民用航空局)",
            "datasetUrl": source["datasetUrl"],
            "resourceUrl": source["url"],
            "hashPageUrl": source["hashPageUrl"],
            "snapshotSha256": source["sha256"],
            "bytes": source["bytes"],
            "license": "OGDL-Taiwan-1.0",
            "licenseUrl": "https://data.gov.tw/license",
            "publishedOrUpdatedOn": "2026-10-01",
            "retrievedAt": item["downloadCompletedAt"],
        })

    asset = {
        "version": 1,
        "kind": "caa-weekly-schedule-reference-tier",
        "asOfDate": AS_OF.isoformat(),
        "candidateManifestSha256": EXPECTED_CANDIDATE_MANIFEST_SHA256,
        "candidateAssociationKeysSha256": candidate_key_set_sha256,
        "runtimeBaseSha256": EXPECTED_RUNTIME_SHA256,
        "associationCount": len(associations),
        "distinctDesignatorCount": len(codes),
        "directedRouteCount": len(routes),
        "operatorIdentity": "unknown",
        "actualOperationConfirmed": False,
        "bookability": "unknown",
        "selectableOperatingService": False,
        "sources": sources,
        "associations": associations,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(asset, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"
    OUT.write_text(payload, encoding="utf-8")
    report = {
        "kind": "caa-weekly-schedule-tier-build",
        "asOfDate": AS_OF.isoformat(),
        "candidateAssociationDenominator": len(candidate_keys),
        "candidateManifestSha256": EXPECTED_CANDIDATE_MANIFEST_SHA256,
        "candidateAssociationKeysSha256": candidate_key_set_sha256,
        "baselineRuntimeSha256": sha256_file(ROOT / "public/data/route-network/runtime-current.json"),
        "exactCaaAssociationKeys": len(exact_by_key),
        "exactCaaSourceRows": exact_source_rows,
        "activeWeeklyAssociationsBeforeConflictHold": active_weekly_count,
        "currentScheduleConflictsHeld": conflict_count,
        "operatorConfirmedAssociationsBefore": len(confirmed_keys),
        "operatorConfirmedAssociationsAfter": len(confirmed_keys),
        "associationCount": len(associations),
        "distinctDesignatorCount": len(codes),
        "directedRouteCount": len(routes),
        "candidateAssociationsOutsideScheduleTier": len(candidate_keys_outside_schedule),
        "scheduleConfirmedAssociationOverlap": len(confirmed_overlap),
        "operatorConfirmedDistinctDesignatorsBefore": len(confirmed_designators),
        "operatorConfirmedDistinctDesignatorsAfter": len(confirmed_designators),
        "scheduleConfirmedRouteOverlap": len(confirmed_routes & schedule_routes),
        "unionAssociationKeys": len(confirmed_keys | schedule_keys),
        "unionDistinctDesignators": len(confirmed_designators | schedule_designators),
        "unionDirectedRouteIdentities": len(confirmed_routes | schedule_routes),
        "sources": [{
            "datasetId": source["datasetId"], "sha256": source["snapshotSha256"], "bytes": source["bytes"],
        } for source in sources],
        "runtimeAsset": {"path": str(OUT.relative_to(ROOT)), "bytes": OUT.stat().st_size, "sha256": sha256_file(OUT)},
    }
    BUILD_REPORT.parent.mkdir(parents=True, exist_ok=True)
    BUILD_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
