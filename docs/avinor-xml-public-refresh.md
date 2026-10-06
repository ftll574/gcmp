# Avinor XML Public snapshot refresh

This is a **manual, one-request refresh path** for the dated OSL evidence. It does not run on a schedule, publish data, or accept a promotion. The current release is a single `TimeFrom=1`, `TimeTo=144` hour response, so its validity ends at retrieval time plus six days.

## Capture and parse

Use the public endpoint only. The command pins OSL and the 144-hour window, makes one request, caps the response at 2 MiB and 30 seconds, refuses redirects, retries, credentials and overwrites, and saves the original XML, headers and local retrieval metadata in a private temporary directory by default.

```sh
capture_dir="$(scripts/refresh-avinor-xml-public.sh)"
python3 scripts/parse-avinor-xml-public-snapshot.py \
  --snapshot "$capture_dir/avinor-osl-public.xml" \
  --metadata "$capture_dir/request-metadata.json" \
  --runtime public/data/route-network/runtime-current.json \
  --output-dir "$capture_dir/review"
```

The parser is offline. It rejects DTD/entity declarations, validates the saved response length and SHA-256, exact-joins Avinor's `OperatingAirlineIata` + full `FlightId` + direction, and withholds rows with a reported via airport or cancellation. A blank `via_airport` means no intermediate airport was reported by this source; it is not independent proof of physical nonstop service. A listed schedule does not prove actual operation. Its JSONL and proposed patch are review material only. The patch keeps each Avinor association source-specific and time-bounded; do not apply it as a generic permanent route or timetable update.

Before any later release, independently review the exact candidate keys, source terms, CAA overlap, captures, freshness cutoff, runtime counts and generated assets. Rebuild and run the repository checks, retain the raw response and linked visible attribution, then publish only through the normal reviewed repository workflow. The app demotes these rows at the UTC cutoff even if no new capture is made.

## Request limits and source terms

Avinor's [flight data service terms](https://partner.avinor.no/en/services/flight-data/) require the exact visible text **“Flight data from Avinor”** to link to [www.avinor.no](https://www.avinor.no/) and appear close to the data. The terms recommend caching and say requests more frequently than every three minutes are unnecessary; this workflow keeps the saved response for reuse and should not be run more frequently than that. Contact Avinor before heavy server load. Do not use the contact-required `XmlFeedScheduled` endpoint, add retries or parallel airport requests, or infer permission from an unavailable robots.txt response.

The capture includes schedule rows, not a durable recurring service, award inventory, bookability, or verification that every scheduled flight departed. Each refresh requires a fresh bounded capture and independent review; there is no unattended recurring job.
