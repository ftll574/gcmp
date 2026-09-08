/**
 * Per-leg CI SkyTeam partner-award zone quotes (Phase-12; decision record
 * docs/decisions/ci-zone-resolution.md). Purely presentational —
 * RtwValidationPanel prepares the rows via resolveCiZone()/quoteCiLeg().
 *
 * Honesty contract (ruling Z1/Z5):
 *   - a leg whose endpoints do not BOTH resolve renders 「區域未知」 — never
 *     a guessed zone;
 *   - surface sectors are labeled, never quoted;
 *   - the 合計 line sums per-leg quotes and is explicitly captioned as a
 *     lower-bound aid: CI's whole-ticket arithmetic is UNVERIFIED.
 */
import { PRICE_KEY_BY_CABIN, type AwardZonePairQuote } from '../lib/rtw/award-pricing.ts';
import { useLocale } from '../i18n/use-locale.ts';
import type { CabinId } from '../lib/types.ts';
export interface CiZoneQuoteRow {
  readonly from: string;
  readonly to: string;
  /** Surface sector — labeled, never priced. */
  readonly surface: boolean;
  /** Null when either endpoint is unmapped or the cell/cabin is unpriced. */
  readonly quote: AwardZonePairQuote | null;
  /** Resolved origin region; null when unmapped. */
  readonly fromZone: string | null;
  /** Resolved destination region; null when unmapped. */
  readonly toZone: string | null;
  /** Per-leg cabin. Null means the user has not chosen it yet. */
  readonly cabin: CabinId | null;
}

export function CiZoneQuotes({
  rows,
}: {
  readonly rows: ReadonlyArray<CiZoneQuoteRow>;
}): React.ReactElement {
  const { t } = useLocale();
  const quotedCount = rows.filter((row) => row.quote !== null).length;
  const total = rows.reduce((sum, row) => sum + (row.quote?.miles ?? 0), 0);
  const rowState = (
    row: CiZoneQuoteRow,
  ): 'quoted' | 'surface' | 'unknown' | 'cabin-unknown' | 'unpriced' => {
    if (row.surface) return 'surface';
    if (!row.fromZone || !row.toZone) return 'unknown';
    if (!row.cabin) return 'cabin-unknown';
    if (!row.quote) return 'unpriced';
    return 'quoted';
  };

  return (
    <div className="ci-zone-quotes">
      <div className="ci-zone-quotes-head">
        <span>{t('rtw.award.ciZone.title')}</span>
        <small>
          {t('rtw.award.ciZone.resolved', { done: String(quotedCount), total: String(rows.length) })}
        </small>
      </div>
      <ul className="ci-zone-quote-list">
        {rows.map((row) => {
          const state = rowState(row);
          return (
            <li key={`${row.from}-${row.to}`} className={state}>
              <span className="ci-zone-leg">
                {row.from}→{row.to}
              </span>
              {state === 'quoted' && row.quote && (
                <>
                  <small className="ci-zone-regions">
                    {t('rtw.award.ciZone.legZones', {
                      origin: row.fromZone ?? '?',
                      dest: row.toZone ?? '?',
                    })}
                  </small>
                  <strong>{row.quote.miles.toLocaleString()}</strong>
                </>
              )}
              {state === 'surface' && (
                <small className="ci-zone-surface">{t('rtw.award.ciZone.surfaceSector')}</small>
              )}
              {state === 'unknown' && (
                <small className="ci-zone-unknown">{t('rtw.award.ciZone.unknownZone')}</small>
              )}
              {state === 'cabin-unknown' && (
                <small className="ci-zone-unknown">{t('rtw.award.ciZone.unknownCabin')}</small>
              )}
              {state === 'unpriced' && (
                <small className="ci-zone-unpriced">
                  {t('rtw.award.ciZone.unpricedCabin', {
                    cabin: row.cabin ? t(`rtw.award.cabin.${PRICE_KEY_BY_CABIN[row.cabin]}`) : t('rtw.timing.unknown'),
                  })}
                </small>
              )}
            </li>
          );
        })}
      </ul>
      {quotedCount >= 2 && (
        <div className="ci-zone-sum">
          <span>{t('rtw.award.ciZone.sum')}</span>
          <strong>{total.toLocaleString()}</strong>
        </div>
      )}
      <small className="ci-zone-note">{t('rtw.award.ciZone.sumNote')}</small>
    </div>
  );
}
