/**
 * Localized airport / city aliases. Map of locale → localized-term →
 * matching IATA codes. Used by the autocomplete to find airports when the
 * user types a city name in their own language.
 *
 *   findLocalizedMatches('東京', 'zh-TW') → ['HND', 'NRT', 'TYO']
 *
 * Only the top ~80 major hubs are covered for v1; English city-name
 * matching (already in airport-index) handles the long tail.
 */

import type { Iata } from '../lib/types.ts';
import type { Locale } from './types.ts';

type Alias = { term: string; iatas: ReadonlyArray<Iata> };

const ZH_TW_ALIASES: ReadonlyArray<Alias> = [
  // East Asia
  { term: '東京', iatas: ['HND', 'NRT', 'TYO'] },
  { term: '羽田', iatas: ['HND'] },
  { term: '成田', iatas: ['NRT'] },
  { term: '大阪', iatas: ['KIX', 'ITM', 'OSA'] },
  { term: '關西', iatas: ['KIX'] },
  { term: '名古屋', iatas: ['NGO'] },
  { term: '福岡', iatas: ['FUK'] },
  { term: '札幌', iatas: ['CTS'] },
  { term: '沖繩', iatas: ['OKA'] },
  { term: '首爾', iatas: ['ICN', 'GMP', 'SEL'] },
  { term: '仁川', iatas: ['ICN'] },
  { term: '釜山', iatas: ['PUS'] },
  { term: '濟州', iatas: ['CJU'] },
  { term: '北京', iatas: ['PEK', 'PKX', 'BJS'] },
  { term: '上海', iatas: ['PVG', 'SHA'] },
  { term: '浦東', iatas: ['PVG'] },
  { term: '虹橋', iatas: ['SHA'] },
  { term: '廣州', iatas: ['CAN'] },
  { term: '深圳', iatas: ['SZX'] },
  { term: '成都', iatas: ['CTU', 'TFU'] },
  { term: '昆明', iatas: ['KMG'] },
  { term: '杭州', iatas: ['HGH'] },
  { term: '香港', iatas: ['HKG'] },
  { term: '澳門', iatas: ['MFM'] },
  { term: '台北', iatas: ['TPE', 'TSA'] },
  { term: '桃園', iatas: ['TPE'] },
  { term: '松山', iatas: ['TSA'] },
  { term: '高雄', iatas: ['KHH'] },
  { term: '台中', iatas: ['RMQ'] },
  // Southeast Asia
  { term: '曼谷', iatas: ['BKK', 'DMK'] },
  { term: '素萬那普', iatas: ['BKK'] },
  { term: '清邁', iatas: ['CNX'] },
  { term: '普吉', iatas: ['HKT'] },
  { term: '新加坡', iatas: ['SIN'] },
  { term: '吉隆坡', iatas: ['KUL'] },
  { term: '檳城', iatas: ['PEN'] },
  { term: '雅加達', iatas: ['CGK'] },
  { term: '峇里島', iatas: ['DPS'] },
  { term: '巴里島', iatas: ['DPS'] },
  { term: '馬尼拉', iatas: ['MNL'] },
  { term: '宿霧', iatas: ['CEB'] },
  { term: '河內', iatas: ['HAN'] },
  { term: '胡志明', iatas: ['SGN'] },
  // South Asia + Middle East
  { term: '德里', iatas: ['DEL'] },
  { term: '孟買', iatas: ['BOM'] },
  { term: '班加羅爾', iatas: ['BLR'] },
  { term: '杜拜', iatas: ['DXB', 'DWC'] },
  { term: '阿布達比', iatas: ['AUH'] },
  { term: '杜哈', iatas: ['DOH'] },
  { term: '伊斯坦堡', iatas: ['IST', 'SAW'] },
  { term: '特拉維夫', iatas: ['TLV'] },
  // Europe
  { term: '倫敦', iatas: ['LHR', 'LGW', 'STN', 'LCY', 'LTN', 'LON'] },
  { term: '希斯洛', iatas: ['LHR'] },
  { term: '蓋威克', iatas: ['LGW'] },
  { term: '巴黎', iatas: ['CDG', 'ORY', 'PAR'] },
  { term: '戴高樂', iatas: ['CDG'] },
  { term: '法蘭克福', iatas: ['FRA'] },
  { term: '慕尼黑', iatas: ['MUC'] },
  { term: '柏林', iatas: ['BER'] },
  { term: '阿姆斯特丹', iatas: ['AMS'] },
  { term: '蘇黎世', iatas: ['ZRH'] },
  { term: '日內瓦', iatas: ['GVA'] },
  { term: '維也納', iatas: ['VIE'] },
  { term: '布魯塞爾', iatas: ['BRU'] },
  { term: '羅馬', iatas: ['FCO', 'CIA'] },
  { term: '米蘭', iatas: ['MXP', 'LIN', 'MIL'] },
  { term: '馬德里', iatas: ['MAD'] },
  { term: '巴塞隆納', iatas: ['BCN'] },
  { term: '里斯本', iatas: ['LIS'] },
  { term: '雅典', iatas: ['ATH'] },
  { term: '哥本哈根', iatas: ['CPH'] },
  { term: '斯德哥爾摩', iatas: ['ARN', 'STO'] },
  { term: '奧斯陸', iatas: ['OSL'] },
  { term: '赫爾辛基', iatas: ['HEL'] },
  { term: '都柏林', iatas: ['DUB'] },
  // North America
  { term: '紐約', iatas: ['JFK', 'LGA', 'EWR', 'NYC'] },
  { term: '甘迺迪', iatas: ['JFK'] },
  { term: '拉瓜迪亞', iatas: ['LGA'] },
  { term: '紐華克', iatas: ['EWR'] },
  { term: '舊金山', iatas: ['SFO'] },
  { term: '洛杉磯', iatas: ['LAX'] },
  { term: '芝加哥', iatas: ['ORD', 'MDW', 'CHI'] },
  { term: '達拉斯', iatas: ['DFW', 'DAL'] },
  { term: '休士頓', iatas: ['IAH', 'HOU'] },
  { term: '邁阿密', iatas: ['MIA'] },
  { term: '亞特蘭大', iatas: ['ATL'] },
  { term: '波士頓', iatas: ['BOS'] },
  { term: '西雅圖', iatas: ['SEA'] },
  { term: '聖地牙哥', iatas: ['SAN'] },
  { term: '丹佛', iatas: ['DEN'] },
  { term: '鳳凰城', iatas: ['PHX'] },
  { term: '拉斯維加斯', iatas: ['LAS'] },
  { term: '奧蘭多', iatas: ['MCO'] },
  { term: '華盛頓', iatas: ['IAD', 'DCA', 'BWI', 'WAS'] },
  { term: '檀香山', iatas: ['HNL'] },
  { term: '安克拉治', iatas: ['ANC'] },
  { term: '多倫多', iatas: ['YYZ', 'YTZ', 'YTO'] },
  { term: '溫哥華', iatas: ['YVR'] },
  { term: '蒙特婁', iatas: ['YUL', 'YMQ'] },
  { term: '墨西哥城', iatas: ['MEX'] },
  // Oceania
  { term: '雪梨', iatas: ['SYD'] },
  { term: '墨爾本', iatas: ['MEL'] },
  { term: '布里斯本', iatas: ['BNE'] },
  { term: '伯斯', iatas: ['PER'] },
  { term: '奧克蘭', iatas: ['AKL'] },
  { term: '威靈頓', iatas: ['WLG'] },
  // Africa
  { term: '開羅', iatas: ['CAI'] },
  { term: '約翰尼斯堡', iatas: ['JNB'] },
  { term: '開普敦', iatas: ['CPT'] },
  { term: '奈洛比', iatas: ['NBO'] },
  // South America
  { term: '聖保羅', iatas: ['GRU', 'CGH', 'SAO'] },
  { term: '里約', iatas: ['GIG', 'SDU', 'RIO'] },
  { term: '布宜諾斯艾利斯', iatas: ['EZE', 'AEP', 'BUE'] },
  { term: '聖地亞哥', iatas: ['SCL'] },
  { term: '利馬', iatas: ['LIM'] },
];

const ALIASES_BY_LOCALE: Partial<Record<Locale, ReadonlyArray<Alias>>> = {
  'zh-TW': ZH_TW_ALIASES,
};

/**
 * Search localized aliases by prefix. Returns up to `limit` IATA codes
 * matching the query — order is "exact-match first, then prefix-match".
 */
export function findLocalizedMatches(
  query: string,
  locale: Locale,
  limit: number = 16,
): ReadonlyArray<Iata> {
  const aliases = ALIASES_BY_LOCALE[locale];
  if (!aliases) return [];
  const q = query.trim();
  if (q.length === 0) return [];

  const out: Iata[] = [];
  const seen = new Set<Iata>();

  // 1. Exact match.
  for (const a of aliases) {
    if (a.term === q) {
      for (const iata of a.iatas) {
        if (!seen.has(iata)) {
          out.push(iata);
          seen.add(iata);
        }
      }
    }
  }
  // 2. Prefix / substring match.
  for (const a of aliases) {
    if (a.term === q) continue;
    if (a.term.startsWith(q) || a.term.includes(q)) {
      for (const iata of a.iatas) {
        if (!seen.has(iata)) {
          out.push(iata);
          seen.add(iata);
          if (out.length >= limit) return out;
        }
      }
    }
  }
  return out;
}
