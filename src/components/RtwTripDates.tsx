import { useLocale } from '../i18n/use-locale.ts';

interface RtwTripDatesProps {
  readonly startDate: string | undefined;
  readonly endDate: string | undefined;
  readonly onChange: (dates: { startDate?: string; endDate?: string }) => void;
}

export function RtwTripDates({
  startDate,
  endDate,
  onChange,
}: RtwTripDatesProps): React.ReactElement {
  const { t } = useLocale();
  return (
    <section className="rtw-trip-dates" aria-label="RTW trip dates">
      <div>
        <p className="rtw-eyebrow">{t('rtw.tripDates.eyebrow')}</p>
        <h2>{t('rtw.tripDates.title')}</h2>
      </div>
      <label>
        <span>{t('rtw.tripDates.start')}</span>
        <input
          type="date"
          value={startDate ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              ...(value ? { startDate: value } : {}),
              ...(endDate ? { endDate } : {}),
            });
          }}
        />
      </label>
      <label>
        <span>{t('rtw.tripDates.end')}</span>
        <input
          type="date"
          value={endDate ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            onChange({
              ...(startDate ? { startDate } : {}),
              ...(value ? { endDate: value } : {}),
            });
          }}
        />
      </label>
    </section>
  );
}
