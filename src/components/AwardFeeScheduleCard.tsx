/**
 * Era-pinned change/reissue/refund fee schedule for one award product.
 * Display-only: real taxes vary by route and are deliberately NOT
 * estimated — amounts shown are transcribed verbatim from the pinned
 * source, and `perMiles` renders as the miles alternative to the cash fee.
 */
import type { AwardFeeSchedule } from '../lib/schemas/award-pricing.ts';
import { useLocale } from '../i18n/use-locale.ts';

const FEE_TYPE_KEYS = {
  'date-change': 'rtw.award.fees.dateChange',
  reissue: 'rtw.award.fees.reissue',
  refund: 'rtw.award.fees.refund',
} as const;

export function AwardFeeScheduleCard({
  schedule,
}: {
  readonly schedule: AwardFeeSchedule;
}): React.ReactElement {
  const { t } = useLocale();
  return (
    <div className="rtw-award-fees">
      <div className="rtw-award-price-topline">
        <span>{t('rtw.award.fees.title')}</span>
        <em className={`rtw-award-confidence ${schedule.confidence}`}>
          {schedule.confidence === 'chart-verified'
            ? t('rtw.award.fees.confidenceChartVerified')
            : t('rtw.award.fees.confidenceCommunityCorrected')}
        </em>
      </div>
      <ul className="rtw-award-fee-list">
        {schedule.entries.map((entry) => (
          <li key={entry.type}>
            <span>{t(FEE_TYPE_KEYS[entry.type])}</span>
            <strong>
              {schedule.currency} {entry.baseAmount.toLocaleString()}
            </strong>
            {entry.perMiles !== undefined ? (
              <small>
                {' · '}
                {t('rtw.award.fees.orPerMiles', { miles: entry.perMiles.toLocaleString() })}
              </small>
            ) : null}
          </li>
        ))}
      </ul>
      <small className="rtw-award-fee-asof">
        {t('rtw.award.fees.asOf', { month: schedule.asOf })}
      </small>
    </div>
  );
}
