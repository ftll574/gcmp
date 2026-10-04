/** Exact primary observations handed off from cloud; read-only, never a dated selectable flight catalog. */
export interface OfficialRouteReference {
 readonly key:string;readonly carrier:string;readonly pair:readonly [string,string];readonly airportLabels:readonly string[];readonly operatorLabel:string;readonly marketingDesignators:readonly string[];readonly independentBoardDesignators:readonly string[];readonly localTimes:readonly string[];readonly durationRaw:string;readonly aircraftRaw:string;readonly passengerClasses:readonly string[];
 readonly carrierIdentityDecision:'operating'|'provider-listed';readonly clockContext:string;readonly sourceFlights:readonly {readonly designator:string;readonly departureRaw:string;readonly arrivalRaw:string}[];readonly seasonRaw:string|null;readonly avinorCorroboration:readonly {readonly flightId:string;readonly scheduledAtUTC:string;readonly rowIds:readonly number[];readonly sourceSHA256:string}[];
 readonly window:{readonly scope:'selected-direction-reference'|'connecting-itinerary-context-only'|'dated-search-reference'|'undated-network-reference'|'seasonal-program-reference';readonly from:string|null;readonly until:string|null;readonly weekdaysRaw:string};readonly observedUTCDate:string;readonly observedUTCMinute:string|null;readonly sourceURLs:readonly string[];readonly sourceIds:readonly string[];readonly captureMode:string;readonly selectable:false;readonly actualFlown:'unverified';readonly bookability:'unknown';readonly note:string;
}
export const OFFICIAL_ROUTE_REFERENCES:readonly OfficialRouteReference[] = [
  {
    "key": "EK:OSL-DXB",
    "carrier": "EK",
    "pair": [
      "OSL",
      "DXB"
    ],
    "airportLabels": [
      "Oslo Gardermoen",
      "Dubai International"
    ],
    "operatorLabel": "Emirates",
    "marketingDesignators": [
      "EK160"
    ],
    "independentBoardDesignators": [],
    "localTimes": [
      "14:35",
      "23:25"
    ],
    "durationRaw": "6h50",
    "aircraftRaw": "A350-900",
    "passengerClasses": [
      "Business",
      "Premium Economy",
      "Economy"
    ],
    "window": {
      "scope": "selected-direction-reference",
      "from": "2026-10-01",
      "until": "2026-10-24",
      "weekdaysRaw": "daily"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": "2026-10-02T23:19Z",
    "sourceURLs": [
      "https://www.emirates.com/ae/english/book/flight-schedules/"
    ],
    "sourceIds": [
      "emirates-osl-dxb-selected-primary-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Current selected directional Non-stop row; operator label and local clocks preserved. Source window is not route launch/cessation or inventory; EK160 remains a candidate only.",
    "carrierIdentityDecision": "operating",
    "clockContext": "source-airport-local",
    "sourceFlights": [],
    "seasonRaw": null,
    "avinorCorroboration": []
  },
  {
    "key": "FI:OSL-KEF",
    "carrier": "FI",
    "pair": [
      "OSL",
      "KEF"
    ],
    "airportLabels": [
      "Oslo Gardermoen",
      "Reykjavik-Keflavik"
    ],
    "operatorLabel": "Icelandair",
    "marketingDesignators": [
      "EK3359"
    ],
    "independentBoardDesignators": [
      "FI319",
      "FI323"
    ],
    "localTimes": [
      "13:50",
      "14:45"
    ],
    "durationRaw": "2h55",
    "aircraftRaw": "737 MAX8",
    "passengerClasses": [],
    "window": {
      "scope": "connecting-itinerary-context-only",
      "from": "2026-10-02",
      "until": "2026-10-12",
      "weekdaysRaw": "Mon/Wed/Fri/Sat/Sun"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://www.emirates.com/ae/english/book/flight-schedules/",
      "https://www.kefairport.com/flights",
      "https://www.icelandair.com/flights/campaign/destinations-schedule/"
    ],
    "sourceIds": [
      "emirates-osl-kef-icelandair-segment-primary-20261003",
      "kef-oslo-fi-board-cloud-20261003",
      "icelandair-oslo-yearround-cloud-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "OSL→KEF separate segment expanded inside DXB→KEF connecting itinerary: explicit Non-stop and operated by Icelandair. EK3359 is marketing, not EK operator; no EK3359↔FI319 mapping. Board independently FI319 fromOslo14:45/FI32317:20 Oct2. Year-round2026–27 supports relation;14weekly onlysummerpeak, not a year-round frequency.",
    "carrierIdentityDecision": "operating",
    "clockContext": "source-airport-local",
    "sourceFlights": [],
    "seasonRaw": null,
    "avinorCorroboration": []
  },
  {
    "key": "DX:OSL-FRO",
    "carrier": "DX",
    "pair": [
      "OSL",
      "FRO"
    ],
    "airportLabels": [
      "OSL",
      "FRO"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [
      "DX572",
      "DX576",
      "DX578"
    ],
    "independentBoardDesignators": [],
    "localTimes": [],
    "durationRaw": "1h10",
    "aircraftRaw": "AT4",
    "passengerClasses": [],
    "window": {
      "scope": "dated-search-reference",
      "from": "2026-10-05",
      "until": "2026-10-05",
      "weekdaysRaw": "one-way selected date only"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://book.dat.dk/search-result",
      "https://dat.dk/destinationer/oslo/",
      "https://luftfartstilsynet.no/globalassets/dokumenter/andre-dokumenter/dat-a-s---uab-dat-lt---advance-notification---working-environment-regulations.pdf"
    ],
    "sourceIds": [
      "dat-osl-oct5-search-primary-cloud-20261003",
      "dat-oslo-grouped-context-cloud-20261003",
      "norway-caa-dat-entities-context-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Dated passenger search cards explicitly Direkte, single two-endpoint timeline. Raw display timezone not explicit; DAT A/S versus DAT LT unresolved. Observed references not launch date, calendar or selectable inventory.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "source-display-timezone-not-explicit",
    "sourceFlights": [
      {
        "designator": "DX572",
        "departureRaw": "08:50",
        "arrivalRaw": "10:00"
      },
      {
        "designator": "DX576",
        "departureRaw": "16:15",
        "arrivalRaw": "17:25"
      },
      {
        "designator": "DX578",
        "departureRaw": "20:15",
        "arrivalRaw": "21:25"
      }
    ],
    "seasonRaw": null,
    "avinorCorroboration": []
  },
  {
    "key": "DX:OSL-OLA",
    "carrier": "DX",
    "pair": [
      "OSL",
      "OLA"
    ],
    "airportLabels": [
      "OSL",
      "OLA"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [
      "DX562",
      "DX568"
    ],
    "independentBoardDesignators": [],
    "localTimes": [],
    "durationRaw": "1h15",
    "aircraftRaw": "AT4",
    "passengerClasses": [],
    "window": {
      "scope": "dated-search-reference",
      "from": "2026-10-05",
      "until": "2026-10-05",
      "weekdaysRaw": "one-way selected date only"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://book.dat.dk/search-result",
      "https://dat.dk/destinationer/oslo/",
      "https://luftfartstilsynet.no/globalassets/dokumenter/andre-dokumenter/dat-a-s---uab-dat-lt---advance-notification---working-environment-regulations.pdf"
    ],
    "sourceIds": [
      "dat-osl-oct5-search-primary-cloud-20261003",
      "dat-oslo-grouped-context-cloud-20261003",
      "norway-caa-dat-entities-context-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Dated passenger search cards explicitly Direkte, single two-endpoint timeline. Raw display timezone not explicit; DAT A/S versus DAT LT unresolved. Observed references not launch date, calendar or selectable inventory.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "source-display-timezone-not-explicit",
    "sourceFlights": [
      {
        "designator": "DX562",
        "departureRaw": "08:50",
        "arrivalRaw": "10:05"
      },
      {
        "designator": "DX568",
        "departureRaw": "18:10",
        "arrivalRaw": "19:25"
      }
    ],
    "seasonRaw": null,
    "avinorCorroboration": []
  },
  {
    "key": "DX:OSL-RRS",
    "carrier": "DX",
    "pair": [
      "OSL",
      "RRS"
    ],
    "airportLabels": [
      "OSL",
      "RRS"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [
      "DX522",
      "DX524"
    ],
    "independentBoardDesignators": [],
    "localTimes": [],
    "durationRaw": "50m",
    "aircraftRaw": "AT4",
    "passengerClasses": [],
    "window": {
      "scope": "dated-search-reference",
      "from": "2026-10-05",
      "until": "2026-10-05",
      "weekdaysRaw": "one-way selected date only"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://book.dat.dk/search-result",
      "https://dat.dk/destinationer/oslo/",
      "https://luftfartstilsynet.no/globalassets/dokumenter/andre-dokumenter/dat-a-s---uab-dat-lt---advance-notification---working-environment-regulations.pdf"
    ],
    "sourceIds": [
      "dat-osl-oct5-search-primary-cloud-20261003",
      "dat-oslo-grouped-context-cloud-20261003",
      "norway-caa-dat-entities-context-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Dated passenger search cards explicitly Direkte, single two-endpoint timeline. Raw display timezone not explicit; DAT A/S versus DAT LT unresolved. Observed references not launch date, calendar or selectable inventory.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "source-display-timezone-not-explicit",
    "sourceFlights": [
      {
        "designator": "DX522",
        "departureRaw": "09:20",
        "arrivalRaw": "10:10"
      },
      {
        "designator": "DX524",
        "departureRaw": "18:10",
        "arrivalRaw": "19:00"
      }
    ],
    "seasonRaw": null,
    "avinorCorroboration": []
  },
  {
    "key": "DX:OSL-SRP",
    "carrier": "DX",
    "pair": [
      "OSL",
      "SRP"
    ],
    "airportLabels": [
      "OSL",
      "SRP"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [
      "DX542",
      "DX546"
    ],
    "independentBoardDesignators": [],
    "localTimes": [],
    "durationRaw": "1h05",
    "aircraftRaw": "AT4",
    "passengerClasses": [],
    "window": {
      "scope": "dated-search-reference",
      "from": "2026-10-05",
      "until": "2026-10-05",
      "weekdaysRaw": "one-way selected date only"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://book.dat.dk/search-result",
      "https://dat.dk/destinationer/oslo/",
      "https://luftfartstilsynet.no/globalassets/dokumenter/andre-dokumenter/dat-a-s---uab-dat-lt---advance-notification---working-environment-regulations.pdf"
    ],
    "sourceIds": [
      "dat-osl-oct5-search-primary-cloud-20261003",
      "dat-oslo-grouped-context-cloud-20261003",
      "norway-caa-dat-entities-context-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Dated passenger search cards explicitly Direkte, single two-endpoint timeline. Raw display timezone not explicit; DAT A/S versus DAT LT unresolved. Observed references not launch date, calendar or selectable inventory.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "source-display-timezone-not-explicit",
    "sourceFlights": [
      {
        "designator": "DX542",
        "departureRaw": "08:30",
        "arrivalRaw": "09:35"
      },
      {
        "designator": "DX546",
        "departureRaw": "18:10",
        "arrivalRaw": "19:15"
      }
    ],
    "seasonRaw": null,
    "avinorCorroboration": []
  },
  {
    "key": "WF:OSL-FDE",
    "carrier": "WF",
    "pair": [
      "OSL",
      "FDE"
    ],
    "airportLabels": [
      "OSL",
      "FDE"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [],
    "independentBoardDesignators": [
      "WF187",
      "WF191"
    ],
    "localTimes": [],
    "durationRaw": "",
    "aircraftRaw": "",
    "passengerClasses": [],
    "window": {
      "scope": "undated-network-reference",
      "from": null,
      "until": null,
      "weekdaysRaw": "unknown"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://www.wideroe.no/destinasjoner/oslo",
      "https://www.wideroe.no/reiseinformasjon/anbudsruter",
      "https://asrv.avinor.no/XmlFeed/v1.0?TimeFrom=1&TimeTo=7&airport=OSL&direction=D&codeshare=Y"
    ],
    "sourceIds": [
      "wideroe-current-oslo-direct-cloud-20261003",
      "wideroe-pso-direction-context-cloud-20261003",
      "avinor-osl-coded-corroboration-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Current official direct prose plus separately saved WF-coded airport references. Network topology only; PSO tender allows intermediate stop and is not standalone nonstop proof; no actual operator or date extension.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "no-source-clock",
    "sourceFlights": [],
    "seasonRaw": null,
    "avinorCorroboration": [
      {
        "flightId": "WF187",
        "scheduledAtUTC": "2026-10-02T10:10:00Z",
        "rowIds": [
          88
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      },
      {
        "flightId": "WF191",
        "scheduledAtUTC": "2026-10-02T13:25:00Z",
        "rowIds": [
          148
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      }
    ]
  },
  {
    "key": "WF:OSL-HOV",
    "carrier": "WF",
    "pair": [
      "OSL",
      "HOV"
    ],
    "airportLabels": [
      "OSL",
      "HOV"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [],
    "independentBoardDesignators": [
      "WF161",
      "WF167",
      "WF171"
    ],
    "localTimes": [],
    "durationRaw": "",
    "aircraftRaw": "",
    "passengerClasses": [],
    "window": {
      "scope": "undated-network-reference",
      "from": null,
      "until": null,
      "weekdaysRaw": "unknown"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://www.wideroe.no/destinasjoner/oslo",
      "https://www.wideroe.no/reiseinformasjon/anbudsruter",
      "https://asrv.avinor.no/XmlFeed/v1.0?TimeFrom=1&TimeTo=7&airport=OSL&direction=D&codeshare=Y"
    ],
    "sourceIds": [
      "wideroe-current-oslo-direct-cloud-20261003",
      "wideroe-pso-direction-context-cloud-20261003",
      "avinor-osl-coded-corroboration-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Current official direct prose plus separately saved WF-coded airport references. Network topology only; PSO tender allows intermediate stop and is not standalone nonstop proof; no actual operator or date extension.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "no-source-clock",
    "sourceFlights": [],
    "seasonRaw": null,
    "avinorCorroboration": [
      {
        "flightId": "WF161",
        "scheduledAtUTC": "2026-10-02T05:45:00Z",
        "rowIds": [
          1
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      },
      {
        "flightId": "WF167",
        "scheduledAtUTC": "2026-10-02T10:00:00Z",
        "rowIds": [
          86
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      },
      {
        "flightId": "WF171",
        "scheduledAtUTC": "2026-10-02T13:15:00Z",
        "rowIds": [
          145
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      }
    ]
  },
  {
    "key": "WF:OSL-SDN",
    "carrier": "WF",
    "pair": [
      "OSL",
      "SDN"
    ],
    "airportLabels": [
      "OSL",
      "SDN"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [],
    "independentBoardDesignators": [
      "WF145"
    ],
    "localTimes": [],
    "durationRaw": "",
    "aircraftRaw": "",
    "passengerClasses": [],
    "window": {
      "scope": "undated-network-reference",
      "from": null,
      "until": null,
      "weekdaysRaw": "unknown"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://www.wideroe.no/destinasjoner/oslo",
      "https://www.wideroe.no/reiseinformasjon/anbudsruter",
      "https://asrv.avinor.no/XmlFeed/v1.0?TimeFrom=1&TimeTo=7&airport=OSL&direction=D&codeshare=Y"
    ],
    "sourceIds": [
      "wideroe-current-oslo-direct-cloud-20261003",
      "wideroe-pso-direction-context-cloud-20261003",
      "avinor-osl-coded-corroboration-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Current official direct prose plus separately saved WF-coded airport references. Network topology only; PSO tender allows intermediate stop and is not standalone nonstop proof; no actual operator or date extension.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "no-source-clock",
    "sourceFlights": [],
    "seasonRaw": null,
    "avinorCorroboration": [
      {
        "flightId": "WF145",
        "scheduledAtUTC": "2026-10-02T08:50:00Z",
        "rowIds": [
          64
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      }
    ]
  },
  {
    "key": "WF:OSL-SOG",
    "carrier": "WF",
    "pair": [
      "OSL",
      "SOG"
    ],
    "airportLabels": [
      "OSL",
      "SOG"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [],
    "independentBoardDesignators": [
      "WF155"
    ],
    "localTimes": [],
    "durationRaw": "",
    "aircraftRaw": "",
    "passengerClasses": [],
    "window": {
      "scope": "undated-network-reference",
      "from": null,
      "until": null,
      "weekdaysRaw": "unknown"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://www.wideroe.no/destinasjoner/oslo",
      "https://www.wideroe.no/reiseinformasjon/anbudsruter",
      "https://asrv.avinor.no/XmlFeed/v1.0?TimeFrom=1&TimeTo=7&airport=OSL&direction=D&codeshare=Y"
    ],
    "sourceIds": [
      "wideroe-current-oslo-direct-cloud-20261003",
      "wideroe-pso-direction-context-cloud-20261003",
      "avinor-osl-coded-corroboration-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Current official direct prose plus separately saved WF-coded airport references. Network topology only; PSO tender allows intermediate stop and is not standalone nonstop proof; no actual operator or date extension.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "no-source-clock",
    "sourceFlights": [],
    "seasonRaw": null,
    "avinorCorroboration": [
      {
        "flightId": "WF155",
        "scheduledAtUTC": "2026-10-02T12:00:00Z",
        "rowIds": [
          119
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      }
    ]
  },
  {
    "key": "DY:OSL-LYR",
    "carrier": "DY",
    "pair": [
      "OSL",
      "LYR"
    ],
    "airportLabels": [
      "OSL",
      "LYR"
    ],
    "operatorLabel": "Unknown / actual company unresolved",
    "marketingDesignators": [],
    "independentBoardDesignators": [
      "DY390"
    ],
    "localTimes": [],
    "durationRaw": "",
    "aircraftRaw": "",
    "passengerClasses": [],
    "window": {
      "scope": "seasonal-program-reference",
      "from": null,
      "until": null,
      "weekdaysRaw": "four/week during S26; exact dates unknown"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://media.no.norwegian.com/pressreleases/norwegian-lanserer-ruteprogrammet-for-sommersesongen-2026-3403695",
      "https://asrv.avinor.no/XmlFeed/v1.0?TimeFrom=1&TimeTo=7&airport=OSL&direction=D&codeshare=Y"
    ],
    "sourceIds": [
      "norwegian-s26-oslo-svalbard-direct-cloud-20261003",
      "avinor-osl-coded-corroboration-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Explicit airline Oslo→Svalbard direct summer2026 program plus independent Oct2 DY390 OSL→LYR exact coded endpoint. Brand/marketing relationship only, not actual company or year-round operation.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "no-source-clock",
    "sourceFlights": [],
    "seasonRaw": "Summer2026 / S26; exact start/end unknown",
    "avinorCorroboration": [
      {
        "flightId": "DY390",
        "scheduledAtUTC": "2026-10-02T08:20:00Z",
        "rowIds": [
          53
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      }
    ]
  },
  {
    "key": "LG:OSL-LUX",
    "carrier": "LG",
    "pair": [
      "OSL",
      "LUX"
    ],
    "airportLabels": [
      "Oslo Gardermoen",
      "Luxembourg-Findel"
    ],
    "operatorLabel": "Luxair",
    "marketingDesignators": [
      "LG5554"
    ],
    "independentBoardDesignators": [],
    "localTimes": [],
    "durationRaw": "2h45",
    "aircraftRaw": "DHC-8 400",
    "passengerClasses": [],
    "window": {
      "scope": "dated-search-reference",
      "from": "2026-10-04",
      "until": "2026-10-04",
      "weekdaysRaw": "exact service weekdays unknown"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://flights.luxair.lu/booking/availability/0",
      "https://www.luxair.lu/en/destinations/oslo/"
    ],
    "sourceIds": [
      "luxair-osl-lux-oct4-selected-cloud-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Date-selection bridge correction resolved by matchingOct4 heading/summary/details; explicit source operatorLuxair. No purchase or strict-service promotion.",
    "carrierIdentityDecision": "operating",
    "clockContext": "source-display-timezone-not-explicit",
    "sourceFlights": [
      {
        "designator": "LG5554",
        "departureRaw": "11:00",
        "arrivalRaw": "13:45"
      }
    ],
    "seasonRaw": null,
    "avinorCorroboration": []
  },
  {
    "key": "BT:OSL-RIX",
    "carrier": "BT",
    "pair": [
      "OSL",
      "RIX"
    ],
    "airportLabels": [
      "Oslo Gardermoen",
      "Riga"
    ],
    "operatorLabel": "Unknown actual operating company",
    "marketingDesignators": [],
    "independentBoardDesignators": [],
    "localTimes": [],
    "durationRaw": "",
    "aircraftRaw": "",
    "passengerClasses": [],
    "window": {
      "scope": "selected-direction-reference",
      "from": "2026-10-03",
      "until": "2026-10-31",
      "weekdaysRaw": "exact service weekdays unknown"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://www.airbaltic.com/en/fly-airbaltic/timetable",
      "https://www.airbaltic.com/en-no/flight-deals/flights-from-oslo-to-riga",
      "https://asrv.avinor.no/XmlFeed/v1.0?TimeFrom=1&TimeTo=7&airport=OSL&direction=D&codeshare=Y"
    ],
    "sourceIds": [
      "airbaltic-osl-rix-direct-calendar-cloud-20261003",
      "airbaltic-oslo-riga-context-cloud-20261003",
      "avinor-osl-coded-corroboration-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Official selected direct destination and farecalendar marksOct3–31; not a verified daily frequency/flight list. Actualoperator and numericdesignator unresolved. Gardermoen selection excludesTRF.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "source-display-timezone-not-explicit",
    "sourceFlights": [],
    "seasonRaw": null,
    "avinorCorroboration": [
      {
        "flightId": "BT152",
        "scheduledAtUTC": "2026-10-02T06:10:00Z",
        "rowIds": [
          5
        ],
        "sourceSHA256": "fcbd2983b6da82c6a36f3c14e80a755cec0ca6848ccd4d964e6840b9907b6fe9"
      }
    ]
  },
  {
    "key": "PC:OSL-SAW",
    "carrier": "PC",
    "pair": [
      "OSL",
      "SAW"
    ],
    "airportLabels": [
      "Oslo Gardermoen",
      "Sabiha Gokcen"
    ],
    "operatorLabel": "Unknown actual company; campaign lists Pegasus operation",
    "marketingDesignators": [],
    "independentBoardDesignators": [],
    "localTimes": [],
    "durationRaw": "",
    "aircraftRaw": "",
    "passengerClasses": [],
    "window": {
      "scope": "seasonal-program-reference",
      "from": "2026-03-29",
      "until": "2026-10-25",
      "weekdaysRaw": "exact service weekdays unknown"
    },
    "observedUTCDate": "2026-10-02",
    "observedUTCMinute": null,
    "sourceURLs": [
      "https://www.flypgs.com/en/campaigns/our-2026-summer-season-offer-for-bolbol-members-includes-international-flights-from-9-taxes",
      "https://www.flypgs.com/en/airports/oslo-gardermoen-airport",
      "https://www.flypgs.com/en/airports/sabiha-gokcen-international-airport"
    ],
    "sourceIds": [
      "pegasus-oslo-saw-s26-direct-cloud-20261003",
      "pegasus-osl-airport-identity-20261003",
      "pegasus-saw-airport-identity-20261003"
    ],
    "captureMode": "cloud-browser-primary-observation;not-local-selected-HTML-reproduction",
    "selectable": false,
    "actualFlown": "unverified",
    "bookability": "unknown",
    "note": "Direct passenger campaign explicitly operatedPegasus excludingjointflights. Preserve campaign operator condition; actual dated-flight company unknown. SaleOct2025 expiry does not expireMar29–Oct25 2026travel season.",
    "carrierIdentityDecision": "provider-listed",
    "clockContext": "source-display-timezone-not-explicit",
    "sourceFlights": [],
    "seasonRaw": "Travel2026-03-29..2026-10-25; sale endedOct2025",
    "avinorCorroboration": []
  }
] ;
/** Only the independently selected direction has a reference window, never an inventory calendar. */
export function officialReferenceWindowState(reference:OfficialRouteReference,date:string):'within-reference'|'outside-reference'|'not-a-leg-calendar' {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Invalid reference date');
 if(!reference.window.from||!reference.window.until||!['selected-direction-reference','dated-search-reference'].includes(reference.window.scope))return 'not-a-leg-calendar';
 return reference.window.from<=date&&date<=reference.window.until?'within-reference':'outside-reference';
}
