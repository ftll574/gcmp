/** Independent airline primary facts only; historical ShareAlike discovery remains isolated. */
export interface CaliPrimaryReference {
 readonly key:string;readonly carrier:string;readonly pair:readonly [string,string];readonly tier:'current-undated-relationship'|'future-selected-reference-only';readonly sourceURLs:readonly string[];readonly sourceIds:readonly string[];readonly operatorLabel:string;readonly operatorDecision:'provider-listed'|'explicit-source-operator-label';readonly selectedDate:string|null;readonly designator:string|null;readonly departureRaw:string|null;readonly arrivalRaw:string|null;readonly durationRaw:string|null;readonly clockContext:string;readonly observedUTCDate:string;readonly observedUTCWindow:string|null;readonly captureMode:string;readonly note:string;readonly selectable:false;
}
export const CALI_PRIMARY_REFERENCES:readonly CaliPrimaryReference[] = [
  {
    "key": "2W:MAD-CLO",
    "carrier": "2W",
    "pair": [
      "MAD",
      "CLO"
    ],
    "tier": "current-undated-relationship",
    "sourceURLs": [
      "https://www.w2fly.es/es-es/vuelos-cali",
      "https://www.iata.org/en/about/members/airline-list/world2fly/568/"
    ],
    "sourceIds": [
      "cali-2w-mad-clo-primary-1-20261003",
      "cali-2w-legal-identity-cloud-20261003"
    ],
    "operatorLabel": "World2Fly S.L., Spain (not WPT Portugal)",
    "operatorDecision": "provider-listed",
    "selectedDate": null,
    "designator": null,
    "departureRaw": null,
    "arrivalRaw": null,
    "durationRaw": null,
    "clockContext": "none",
    "observedUTCDate": "2026-10-03",
    "observedUTCWindow": null,
    "captureMode": "parent-cloud-primary-page-observation;not-local-HTML-reproduction",
    "note": "Exact MAD/CLO, direct and sin escalas passenger-booking route text. No dated schedule or per-flight legal operator proof. No May-only or twice-weekly schedule inference.",
    "selectable": false
  },
  {
    "key": "2W:CLO-MAD",
    "carrier": "2W",
    "pair": [
      "CLO",
      "MAD"
    ],
    "tier": "current-undated-relationship",
    "sourceURLs": [
      "https://www.w2fly.es/es-es/vuelos-madrid",
      "https://www.iata.org/en/about/members/airline-list/world2fly/568/"
    ],
    "sourceIds": [
      "cali-2w-clo-mad-primary-1-20261003",
      "cali-2w-legal-identity-cloud-20261003"
    ],
    "operatorLabel": "World2Fly S.L., Spain (not WPT Portugal)",
    "operatorDecision": "provider-listed",
    "selectedDate": null,
    "designator": null,
    "departureRaw": null,
    "arrivalRaw": null,
    "durationRaw": null,
    "clockContext": "none",
    "observedUTCDate": "2026-10-03",
    "observedUTCWindow": null,
    "captureMode": "parent-cloud-primary-page-observation;not-local-HTML-reproduction",
    "note": "Independent Cali-origin Madrid route row and sin escalas. No dated schedule or per-flight legal operator proof. No May-only or twice-weekly schedule inference.",
    "selectable": false
  },
  {
    "key": "VE:CLO-VVC",
    "carrier": "VE",
    "pair": [
      "CLO",
      "VVC"
    ],
    "tier": "current-undated-relationship",
    "sourceURLs": [
      "https://clicair.co/vuelos/villavicencio",
      "https://clicair.co/destinos-colombia/es/vuelos-desde-cali-a-villavicencio",
      "https://www.iata.org/en/about/members/airline-list/clic-air/608/"
    ],
    "sourceIds": [
      "cali-ve-clo-vvc-primary-1-20261003",
      "cali-ve-clo-vvc-primary-2-20261003",
      "cali-ve-legal-identity-cloud-20261003"
    ],
    "operatorLabel": "Clic Air S.A.; raw EASYFLY S.A legal-name mapping retained",
    "operatorDecision": "provider-listed",
    "selectedDate": null,
    "designator": null,
    "departureRaw": null,
    "arrivalRaw": null,
    "durationRaw": null,
    "clockContext": "none",
    "observedUTCDate": "2026-10-03",
    "observedUTCWindow": null,
    "captureMode": "parent-cloud-primary-page-observation;not-local-HTML-reproduction",
    "note": "Independent directed Cali→Villavicencio row and current passenger offers; combined current direct language. Booking no-stop result unavailable. No dated schedule or per-flight legal operator proof. No May-only or twice-weekly schedule inference.",
    "selectable": false
  },
  {
    "key": "VE:VVC-CLO",
    "carrier": "VE",
    "pair": [
      "VVC",
      "CLO"
    ],
    "tier": "current-undated-relationship",
    "sourceURLs": [
      "https://clicair.co/vuelos/cali",
      "https://clicair.co/vuelos/villavicencio",
      "https://clicair.co/destinos-colombia/es/vuelos-desde-villavicencio-a-cali",
      "https://www.iata.org/en/about/members/airline-list/clic-air/608/"
    ],
    "sourceIds": [
      "cali-ve-vvc-clo-primary-1-20261003",
      "cali-ve-vvc-clo-primary-2-20261003",
      "cali-ve-vvc-clo-primary-3-20261003",
      "cali-ve-legal-identity-cloud-20261003"
    ],
    "operatorLabel": "Clic Air S.A.; raw EASYFLY S.A legal-name mapping retained",
    "operatorDecision": "provider-listed",
    "selectedDate": null,
    "designator": null,
    "departureRaw": null,
    "arrivalRaw": null,
    "durationRaw": null,
    "clockContext": "none",
    "observedUTCDate": "2026-10-03",
    "observedUTCWindow": null,
    "captureMode": "parent-cloud-primary-page-observation;not-local-HTML-reproduction",
    "note": "Independent Villavicencio→Cali row plus explicit Villavicencio–Cali direct prose; November10 offer is context, not launch or October dated service. No dated schedule or per-flight legal operator proof. No May-only or twice-weekly schedule inference.",
    "selectable": false
  },
  {
    "key": "P5:CLO-AUA",
    "carrier": "P5",
    "pair": [
      "CLO",
      "AUA"
    ],
    "tier": "future-selected-reference-only",
    "sourceURLs": [
      "https://booking.wingo.com/es/search/CLO/AUA/2027-01-14/1/0/0/1/USD/0/0?emcid=T-m87EtVit9",
      "https://www.wingo.com/es/vuelos-de-cali-a-oranjestad",
      "https://www.iata.org/en/about/members/airline-list/aero-republica/400/"
    ],
    "sourceIds": [],
    "operatorLabel": "Aero República S.A",
    "operatorDecision": "explicit-source-operator-label",
    "selectedDate": "2027-01-14",
    "designator": "P57456",
    "departureRaw": "08:28",
    "arrivalRaw": "11:32",
    "durationRaw": "2h04",
    "clockContext": "raw-card-timezone-not-explicit",
    "observedUTCDate": "2026-10-03",
    "observedUTCWindow": "2026-10-03T00:51Z–2026-10-03T00:58Z",
    "captureMode": "parent-cloud-browser-selected-primary-observation;not-local-HTML-reproduction",
    "note": "Directo, one flight/two airports, passenger fare and explicit operator. Selected date is not launch, October operation or continuous season. No actual-flown, inventory or strict selectable-service import.",
    "selectable": false
  },
  {
    "key": "P5:AUA-CLO",
    "carrier": "P5",
    "pair": [
      "AUA",
      "CLO"
    ],
    "tier": "future-selected-reference-only",
    "sourceURLs": [
      "https://booking.wingo.com/es/search/AUA/CLO/2026-11-05/1/0/0/1/USD/0/0",
      "https://www.wingo.com/es/vuelos-de-oranjestad-a-cali",
      "https://www.iata.org/en/about/members/airline-list/aero-republica/400/"
    ],
    "sourceIds": [],
    "operatorLabel": "Aero República S.A",
    "operatorDecision": "explicit-source-operator-label",
    "selectedDate": "2026-11-05",
    "designator": "P57457",
    "departureRaw": "12:52",
    "arrivalRaw": "14:01",
    "durationRaw": "2h09",
    "clockContext": "raw-card-timezone-not-explicit",
    "observedUTCDate": "2026-10-03",
    "observedUTCWindow": "2026-10-03T00:51Z–2026-10-03T00:58Z",
    "captureMode": "parent-cloud-browser-selected-primary-observation;not-local-HTML-reproduction",
    "note": "Directo, one flight/two airports, passenger fare and explicit operator. Selected date is not launch, October operation or continuous season. No actual-flown, inventory or strict selectable-service import.",
    "selectable": false
  },
  {
    "key": "P5:BLB-CLO",
    "carrier": "P5",
    "pair": [
      "BLB",
      "CLO"
    ],
    "tier": "future-selected-reference-only",
    "sourceURLs": [
      "https://booking.wingo.com/es/search/BLB/CLO/2026-12-11/1/0/0/1/USD/0/0",
      "https://www.wingo.com/es/vuelos-de-ciudad-de-panama-a-cali",
      "https://www.iata.org/en/about/members/airline-list/aero-republica/400/"
    ],
    "sourceIds": [],
    "operatorLabel": "Aero República S.A",
    "operatorDecision": "explicit-source-operator-label",
    "selectedDate": "2026-12-11",
    "designator": "P57039",
    "departureRaw": "10:52",
    "arrivalRaw": "12:23",
    "durationRaw": "1h31",
    "clockContext": "raw-card-timezone-not-explicit",
    "observedUTCDate": "2026-10-03",
    "observedUTCWindow": "2026-10-03T00:51Z–2026-10-03T00:58Z",
    "captureMode": "parent-cloud-browser-selected-primary-observation;not-local-HTML-reproduction",
    "note": "Directo, one flight/two airports, passenger fare and explicit operator. Selected date is not launch, October operation or continuous season. No actual-flown, inventory or strict selectable-service import.",
    "selectable": false
  },
  {
    "key": "P5:CLO-BLB",
    "carrier": "P5",
    "pair": [
      "CLO",
      "BLB"
    ],
    "tier": "future-selected-reference-only",
    "sourceURLs": [
      "https://booking.wingo.com/es/search/CLO/BLB/2026-12-23/1/0/0/1/USD/0/0",
      "https://www.wingo.com/es/vuelos-de-cali-a-ciudad-de-panama",
      "https://www.iata.org/en/about/members/airline-list/aero-republica/400/"
    ],
    "sourceIds": [],
    "operatorLabel": "Aero República S.A",
    "operatorDecision": "explicit-source-operator-label",
    "selectedDate": "2026-12-23",
    "designator": "P57036",
    "departureRaw": "08:38",
    "arrivalRaw": "10:00",
    "durationRaw": "1h22",
    "clockContext": "raw-card-timezone-not-explicit",
    "observedUTCDate": "2026-10-03",
    "observedUTCWindow": "2026-10-03T00:51Z–2026-10-03T00:58Z",
    "captureMode": "parent-cloud-browser-selected-primary-observation;not-local-HTML-reproduction",
    "note": "Directo, one flight/two airports, passenger fare and explicit operator. Selected date is not launch, October operation or continuous season. No actual-flown, inventory or strict selectable-service import.",
    "selectable": false
  }
,
{
  "key": "P5:CLO-BOG",
  "carrier": "P5",
  "pair": [
    "CLO",
    "BOG"
  ],
  "tier": "future-selected-reference-only",
  "sourceURLs": [
    "https://booking.wingo.com/es/search/CLO/BOG/2026-10-14/1/0/0/1/USD/0/0",
    "https://www.wingo.com/es/vuelos-de-cali-a-bogota",
    "https://www.iata.org/en/about/members/airline-list/aero-republica/400/"
  ],
  "sourceIds": [],
  "operatorLabel": "Aero Rep\u00fablica S.A",
  "operatorDecision": "explicit-source-operator-label",
  "selectedDate": "2026-10-14",
  "designator": "P57511",
  "departureRaw": "03:29",
  "arrivalRaw": "04:30",
  "durationRaw": "1h01",
  "clockContext": "raw-card-timezone-not-explicit",
  "observedUTCDate": "2026-10-03",
  "observedUTCWindow": "2026-10-03 around 01:37 UTC (approximate)",
  "captureMode": "parent-cloud-browser-selected-primary-observation;not-local-HTML-reproduction",
  "note": "Directo, two airports, passenger fare and explicit operator. Selected date is not launch, current-today, year-round or daily-operation proof. Other displayed source designators: P57257, P57261. All designators remain reference-only, neither runtime candidates nor confirmed selectable flights. No actual-flown or inventory import.",
  "selectable": false
},
{
  "key": "P5:BOG-CLO",
  "carrier": "P5",
  "pair": [
    "BOG",
    "CLO"
  ],
  "tier": "future-selected-reference-only",
  "sourceURLs": [
    "https://booking.wingo.com/es/search/BOG/CLO/2026-10-14/1/0/0/1/USD/0/0",
    "https://www.wingo.com/es/vuelos-de-bogota-a-cali",
    "https://www.iata.org/en/about/members/airline-list/aero-republica/400/"
  ],
  "sourceIds": [],
  "operatorLabel": "Aero Rep\u00fablica S.A",
  "operatorDecision": "explicit-source-operator-label",
  "selectedDate": "2026-10-14",
  "designator": "P57510",
  "departureRaw": "01:40",
  "arrivalRaw": "02:49",
  "durationRaw": "1h09",
  "clockContext": "raw-card-timezone-not-explicit",
  "observedUTCDate": "2026-10-03",
  "observedUTCWindow": "2026-10-03 around 01:37 UTC (approximate)",
  "captureMode": "parent-cloud-browser-selected-primary-observation;not-local-HTML-reproduction",
  "note": "Directo, two airports, passenger fare and explicit operator. Selected date is not launch, current-today, year-round or daily-operation proof. Other displayed source designators: P57250, P57260. All designators remain reference-only, neither runtime candidates nor confirmed selectable flights. No actual-flown or inventory import.",
  "selectable": false
}
];
