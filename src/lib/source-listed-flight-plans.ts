/** Source-listed plans are review evidence, never selectable service records. */
export type ListedPlanCalendar =
 | {readonly kind:'daily-from';readonly from:string;readonly until:null}
 | {readonly kind:'discrete';readonly dates:readonly string[]}
 | {readonly kind:'source-text';readonly label:string};
export interface ListedFutureFlightPlan {
 readonly key:string;readonly marketingCarrier:string;readonly flightNumber:string|null;
 readonly calendar:ListedPlanCalendar;readonly departureLocal:string|null;readonly arrivalLocal:string|null;readonly localTimeLabel:string|null;
 readonly timeWindows?:readonly {readonly from:string;readonly until:string|null;readonly departureLocal:string;readonly arrivalLocal:string;readonly arrivalDayOffset:number;readonly firstMatchingDeparture:string}[];
 readonly sourceURLs:readonly string[];readonly provenance:string;readonly note:string;
 readonly evidenceStatus:'source-listed';readonly selectable:false;readonly actualOperatingCompany:null;
 readonly bookability:'unknown';readonly currentRouteImport:false;readonly checkedOn:string;
}
export const SOURCE_LISTED_FUTURE_PLANS:readonly ListedFutureFlightPlan[] = [
  {
    "key": "JL:ITM-MMB",
    "marketingCarrier": "JL",
    "flightNumber": "JL2103",
    "calendar": {
      "kind": "daily-from",
      "from": "2027-02-01",
      "until": null
    },
    "departureLocal": "10:50",
    "arrivalLocal": "12:50",
    "localTimeLabel": "日本當地時刻",
    "sourceURLs": [
      "https://prtimes.jp/main/html/rd/p/000000416.000045236.html"
    ],
    "provenance": "官方發行者頁面及時刻表圖片已本機核驗；2026-09-18 發布。",
    "note": "無終止日。2026-07-17～08-28 的舊夏季運航已結束，未填補兩季間隔。",
    "evidenceStatus": "source-listed",
    "selectable": false,
    "actualOperatingCompany": null,
    "bookability": "unknown",
    "currentRouteImport": false,
    "checkedOn": "2026-10-02"
  },
  {
    "key": "JL:MMB-ITM",
    "marketingCarrier": "JL",
    "flightNumber": "JL2104",
    "calendar": {
      "kind": "daily-from",
      "from": "2027-02-01",
      "until": null
    },
    "departureLocal": "13:25",
    "arrivalLocal": "15:50",
    "localTimeLabel": "日本當地時刻",
    "sourceURLs": [
      "https://prtimes.jp/main/html/rd/p/000000416.000045236.html"
    ],
    "provenance": "官方發行者頁面及時刻表圖片已本機核驗；2026-09-18 發布。",
    "note": "無終止日。2026-07-17～08-28 的舊夏季運航已結束，未填補兩季間隔。",
    "evidenceStatus": "source-listed",
    "selectable": false,
    "actualOperatingCompany": null,
    "bookability": "unknown",
    "currentRouteImport": false,
    "checkedOn": "2026-10-02"
  },
  {
    "key": "JL:ITM-TKN",
    "marketingCarrier": "JL",
    "flightNumber": "JL2471",
    "calendar": {
      "kind": "discrete",
      "dates": [
        "2026-12-28",
        "2027-01-01"
      ]
    },
    "departureLocal": "11:00",
    "arrivalLocal": "13:00",
    "localTimeLabel": "日本當地時刻",
    "sourceURLs": [
      "https://www.town.amagi.lg.jp/docs/5825.html"
    ],
    "provenance": "官方頁面及日期圖片已本機核驗；2026-09-02 刊登日為雲端 archive 核驗，本機 archive 逾時。",
    "note": "僅兩個列示日期，中間日期沒有服務證據。",
    "evidenceStatus": "source-listed",
    "selectable": false,
    "actualOperatingCompany": null,
    "bookability": "unknown",
    "currentRouteImport": false,
    "checkedOn": "2026-10-02"
  },
  {
    "key": "JL:TKN-ITM",
    "marketingCarrier": "JL",
    "flightNumber": "JL2470",
    "calendar": {
      "kind": "discrete",
      "dates": [
        "2026-12-28",
        "2027-01-01"
      ]
    },
    "departureLocal": "13:30",
    "arrivalLocal": "15:00",
    "localTimeLabel": "日本當地時刻",
    "sourceURLs": [
      "https://www.town.amagi.lg.jp/docs/5825.html"
    ],
    "provenance": "官方頁面及日期圖片已本機核驗；2026-09-02 刊登日為雲端 archive 核驗，本機 archive 逾時。",
    "note": "僅兩個列示日期，中間日期沒有服務證據。",
    "evidenceStatus": "source-listed",
    "selectable": false,
    "actualOperatingCompany": null,
    "bookability": "unknown",
    "currentRouteImport": false,
    "checkedOn": "2026-10-02"
  },
  {
    "key": "OS:BRU-INN",
    "marketingCarrier": "OS",
    "flightNumber": null,
    "calendar": {
      "kind": "source-text",
      "label": "2026 年 12 月／週六，確切首末日期未知"
    },
    "departureLocal": null,
    "arrivalLocal": null,
    "localTimeLabel": null,
    "sourceURLs": [
      "https://www.innsbruck-airport.com/fileadmin/userdaten/docs/Flugplan/Flugplan_Homepage_27_04_2026.pdf",
      "https://www.brusselsairlines.com/lhg/at/en/o-d/cy-cy/brussels-innsbruck"
    ],
    "provenance": "雲端來源核驗；本機原文存取受限或新聞內文未重現。",
    "note": "保留原始季節範圍；未合併其他時刻參考或推定缺少的日期／公司。",
    "evidenceStatus": "source-listed",
    "selectable": false,
    "actualOperatingCompany": null,
    "bookability": "unknown",
    "currentRouteImport": false,
    "checkedOn": "2026-10-02"
  },
  {
    "key": "SN:BRU-KEM",
    "marketingCarrier": "SN",
    "flightNumber": null,
    "calendar": {
      "kind": "source-text",
      "label": "2026-12-25～2027-03-10，每週 1–2 班"
    },
    "departureLocal": null,
    "arrivalLocal": null,
    "localTimeLabel": null,
    "sourceURLs": [
      "https://press.brusselsairlines.com/brussels-airlines-goes-nordic-adds-evenes-kemi-and-kittila-to-its-network",
      "https://www.finavia.fi/en/newsroom/2026/new-routes-brussels-kemi-tornio-and-kittila-airports?navref=related",
      "https://www.brusselsairlines.com/lhg/fi/en/o-d/cy-cy/brussels-kem"
    ],
    "provenance": "雲端來源核驗；本機原文存取受限或新聞內文未重現。",
    "note": "保留原始季節範圍；未合併其他時刻參考或推定缺少的日期／公司。",
    "evidenceStatus": "source-listed",
    "selectable": false,
    "actualOperatingCompany": null,
    "bookability": "unknown",
    "currentRouteImport": false,
    "checkedOn": "2026-10-02"
  },
  {
    "key": "AY:BRU-KTT",
    "marketingCarrier": "AY",
    "flightNumber": null,
    "calendar": {
      "kind": "source-text",
      "label": "2026 冬季／每週兩班，確切首末日期未知"
    },
    "departureLocal": null,
    "arrivalLocal": null,
    "localTimeLabel": null,
    "sourceURLs": [
      "https://company.finnair.com/en/media-centre/all-releases/news?id=64267A00F20E553A",
      "https://www.finavia.fi/en/newsroom/2025/finnair-launch-flights-12-new-destinations-summer-2026-and-expand-connections-lapland"
    ],
    "provenance": "雲端來源核驗；本機原文存取受限或新聞內文未重現。",
    "note": "保留原始季節範圍；未合併其他時刻參考或推定缺少的日期／公司。",
    "evidenceStatus": "source-listed",
    "selectable": false,
    "actualOperatingCompany": null,
    "bookability": "unknown",
    "currentRouteImport": false,
    "checkedOn": "2026-10-02"
  },
{
  "key": "CZ:ADD-CSX",
  "marketingCarrier": "CZ",
  "flightNumber": "CZ8096",
  "calendar": {
    "kind": "source-text",
    "label": "2026-10-12 起週一、週五；終止日未知"
  },
  "departureLocal": "23:00",
  "arrivalLocal": "15:10 +1／14:20 +1（依來源窗口）",
  "localTimeLabel": "來源當地時間",
  "timeWindows": [
    {
      "from": "2026-10-12",
      "until": "2026-10-24",
      "departureLocal": "23:00",
      "arrivalLocal": "15:10",
      "arrivalDayOffset": 1,
      "firstMatchingDeparture": "2026-10-12"
    },
    {
      "from": "2026-10-25",
      "until": null,
      "departureLocal": "23:00",
      "arrivalLocal": "14:20",
      "arrivalDayOffset": 1,
      "firstMatchingDeparture": "2026-10-26"
    }
  ],
  "sourceURLs": [
    "https://www.csair.com/pagezsloss/mcmsSqueezePage/MEA/en/2026/20260811_2/flight.html",
    "https://www.caac.gov.cn/English/BeltAndRoad/202609/t20260923_231779.html"
  ],
  "provenance": "航空公司公開班表及民航局 2026-09-23 公告已保存核對。公告列示南航與 787，尚非實際運航證明。",
  "note": "10/12～10/24 抵達 15:10 +1；10/25 起抵達 14:20 +1，該窗口首個週一為 10/26。未推定 ADD→CAN 直飛或反向；票價優惠 11/12 截止不是服務終止日。",
  "evidenceStatus": "source-listed",
  "selectable": false,
  "actualOperatingCompany": null,
  "bookability": "unknown",
  "currentRouteImport": false,
  "checkedOn": "2026-10-03"
}
];
export function listedPlanCalendarLabel(calendar:ListedPlanCalendar):string {
 switch(calendar.kind){
 case 'daily-from':return `${calendar.from} 起每日；終止日未知`;
 case 'discrete':return `僅 ${calendar.dates.join('、')}`;
 case 'source-text':return calendar.label;
 }
}
