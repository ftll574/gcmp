"""Extract distinct current alliance callsigns from ADSBiq daily Parquet files.

Research dependency: duckdb. This script writes only the small public-flight
callsign snapshot used by build-recent-alliance-routes.ts; raw ADS-B files are
never copied into the repository.
"""
from __future__ import annotations

import json
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.request import Request, urlopen

import duckdb


def release_assets(month: str) -> dict[str, str]:
    url = f"https://api.github.com/repos/Sky-Power-Services/adsbiq-data/releases/tags/{month}"
    request = Request(url, headers={"User-Agent": "gcmp-route-research"})
    with urlopen(request, timeout=30) as response:
        payload = json.load(response)
    return {
        asset["name"]: asset["browser_download_url"]
        for asset in payload.get("assets", [])
        if isinstance(asset, dict) and isinstance(asset.get("name"), str)
        and isinstance(asset.get("browser_download_url"), str)
    }


def main() -> None:
    if len(sys.argv) < 5:
        raise SystemExit("usage: extract-adsbiq-alliance-callsigns.py ICAO_MAP_JSON OUTPUT_JSON FROM_DATE UNTIL_DATE")
    mapping = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    prefixes = sorted({row["icao"] for row in mapping})
    if not prefixes or len(prefixes) > 200:
        raise SystemExit(f"unexpected ICAO prefix count: {len(prefixes)}")

    from_date = date.fromisoformat(sys.argv[3])
    until_date = date.fromisoformat(sys.argv[4])
    if from_date > until_date or (until_date - from_date).days > 62:
        raise SystemExit("invalid extraction window")
    days = []
    current = from_date
    while current <= until_date:
        days.append(current)
        current += timedelta(days=1)
    assets_by_month = {month: release_assets(month) for month in sorted({f"{day:%Y-%m}" for day in days})}
    urls = []
    missing_dates = []
    for day in days:
        name = f"aircraft_diffs_{day:%Y-%m-%d}.parquet"
        url = assets_by_month[f"{day:%Y-%m}"].get(name)
        if url is None:
            missing_dates.append(day.isoformat())
        else:
            urls.append(url)
    if not urls or len(missing_dates) > 2:
        raise SystemExit(f"unexpected ADSBiq release gaps: {missing_dates}")
    con = duckdb.connect()
    con.execute("SET enable_progress_bar=false")
    values = ",".join("(?)" for _ in prefixes)
    # Prefix extraction is deliberately strict: three ICAO letters followed
    # by at least one alphanumeric flight identifier character.
    query = f"""
        WITH prefixes(prefix) AS (VALUES {values}),
        observed AS (
          SELECT DISTINCT upper(trim(flight)) AS callsign
          FROM read_parquet(?)
          WHERE flight IS NOT NULL
        )
        SELECT callsign
        FROM observed
        JOIN prefixes ON starts_with(callsign, prefix)
        WHERE length(callsign) > 3
          AND regexp_matches(callsign, '^[A-Z]{{3}}[A-Z0-9]+$')
        ORDER BY callsign
    """
    callsigns = [row[0] for row in con.execute(query, [*prefixes, urls]).fetchall()]
    payload = {
        "version": 1,
        "from": from_date.isoformat(),
        "until": until_date.isoformat(),
        "sourceUrls": urls,
        "missingDates": missing_dates,
        "callsigns": callsigns,
    }
    Path(sys.argv[2]).write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps({"prefixes": len(prefixes), "days": len(urls), "missingDates": missing_dates,
                      "callsigns": len(callsigns), "output": sys.argv[2]}, indent=2))


if __name__ == "__main__":
    main()
