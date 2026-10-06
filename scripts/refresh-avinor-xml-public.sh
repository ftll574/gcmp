#!/usr/bin/env bash
set -euo pipefail
umask 077

# One fixed-scope, one-shot request to the documented XML Public endpoint.
# No redirects, retries, credentials, loops, alternate endpoints or parameters.
readonly endpoint='https://asrv.avinor.no/XmlFeed/v1.0?airport=OSL&TimeFrom=1&TimeTo=144&codeshare=Y'
readonly destination="${1:-${TMPDIR:-/tmp}/gcmp-avinor-osl-public-$(date -u +%Y%m%dT%H%M%SZ)}"
readonly max_bytes=2097152

mkdir -m 700 -p "$destination"
for name in avinor-osl-public.xml avinor-osl-public.headers request-metadata.json; do
  if [[ -e "$destination/$name" ]]; then
    echo "Refusing to overwrite existing capture file: $destination/$name" >&2
    exit 2
  fi
done

temporary_xml="$destination/.avinor-osl-public.xml.partial"
status_file="$destination/.http-status"
trap 'rm -f "$temporary_xml" "$status_file"' EXIT

curl --fail --silent --show-error \
  --connect-timeout 10 --max-time 30 --max-filesize "$max_bytes" --max-redirs 0 \
  --dump-header "$destination/avinor-osl-public.headers" \
  --output "$temporary_xml" --write-out '%{http_code}' --url "$endpoint" > "$status_file"

status="$(cat "$status_file")"
if [[ "$status" != '200' ]] || ! grep -Eiq '^content-type:[[:space:]]*application/xml([;[:space:]]|$)' "$destination/avinor-osl-public.headers"; then
  echo "Expected HTTP 200 application/xml without following redirects; got HTTP $status. Capture rejected." >&2
  exit 1
fi

mv "$temporary_xml" "$destination/avinor-osl-public.xml"
python3 - "$destination" "$endpoint" "$max_bytes" <<'PY'
import datetime as dt
import hashlib
import json
import pathlib
import sys

directory = pathlib.Path(sys.argv[1])
endpoint = sys.argv[2]
limit = int(sys.argv[3])
raw = (directory / "avinor-osl-public.xml").read_bytes()
if not raw or len(raw) > limit:
    raise SystemExit(f"Unexpected response size: {len(raw)} bytes (limit {limit})")
headers = (directory / "avinor-osl-public.headers").read_text(encoding="iso-8859-1")
content_type = next((line.split(":", 1)[1].strip() for line in headers.splitlines()
                     if line.lower().startswith("content-type:")), "")
metadata = {
    "kind": "avinor-xml-public-manual-snapshot",
    "accessClass": "XML Public; XML Scheduled is contact-required and is not used",
    "method": "GET",
    "endpoint": "https://asrv.avinor.no/XmlFeed/v1.0",
    "requestUrl": endpoint,
    "httpStatus": 200,
    "contentType": content_type,
    "retrievedAtUTC": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    "query": {"airport": "OSL", "TimeFrom": "1", "TimeTo": "144", "codeshare": "Y",
              "direction": "omitted; both arrival and departure rows"},
    "responseBytes": len(raw),
    "responseSHA256": hashlib.sha256(raw).hexdigest(),
    "rawResponsePath": "avinor-osl-public.xml",
    "responseHeadersPath": "avinor-osl-public.headers",
    "xmlPublicRequests": 1,
    "redirectsFollowed": False,
    "retryCount": 0,
    "robotstxtProbe": {"result": "not probed; no robots policy inferred"},
}
(directory / "request-metadata.json").write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

echo "Saved one bounded Avinor XML Public OSL capture in: $destination" >&2
echo "$destination"
