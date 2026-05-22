import type { Airline, AirlineIata, Airport } from '../lib/types.ts';
import { useLocale } from '../i18n/use-locale.ts';

interface RtwLegTableProps {
  readonly airports: ReadonlyArray<Airport>;
  readonly operatingCarriers: ReadonlyArray<AirlineIata>;
  readonly stopovers: ReadonlyArray<boolean | undefined>;
  readonly surfaces: ReadonlyArray<boolean | undefined>;
  readonly airlines: ReadonlyArray<Airline>;
  readonly onCarrierChange: (legIndex: number, carrier: AirlineIata) => void;
  readonly onStopoverChange: (legIndex: number, stopover: boolean | undefined) => void;
  readonly onSurfaceChange: (legIndex: number, surface: boolean) => void;
}

export function RtwLegTable({
  airports,
  operatingCarriers,
  stopovers,
  surfaces,
  airlines,
  onCarrierChange,
  onStopoverChange,
  onSurfaceChange,
}: RtwLegTableProps): React.ReactElement | null {
  const { t } = useLocale();
  if (airports.length < 2) return null;

  return (
    <section className="rtw-leg-table-wrap" aria-label="RTW leg details">
      <div className="rtw-leg-table-heading">
        <div>
          <p className="rtw-eyebrow">{t('rtw.legTable.eyebrow')}</p>
          <h2>{t('rtw.legTable.title')}</h2>
        </div>
      </div>
      <div className="rtw-leg-table-scroll">
        <table className="rtw-leg-table">
          <thead>
            <tr>
              <th>{t('rtw.legTable.leg')}</th>
              <th>{t('rtw.legTable.operating')}</th>
              <th>{t('rtw.legTable.timing')}</th>
              <th>{t('rtw.legTable.surface')}</th>
            </tr>
          </thead>
          <tbody>
            {airports.slice(0, -1).map((from, index) => {
              const to = airports[index + 1];
              if (!to) return null;
              return (
                <tr key={`${from.iata}-${to.iata}-${index}`}>
                  <td>
                    <span className="rtw-leg-route">
                      {from.iata} → {to.iata}
                    </span>
                    <span className="rtw-leg-city">
                      {from.city} to {to.city}
                    </span>
                  </td>
                  <td>
                    <select
                      value={operatingCarriers[index] ?? 'AA'}
                      onChange={(event) => onCarrierChange(index, event.target.value.toUpperCase())}
                      disabled={surfaces[index] === true}
                      aria-label={t('rtw.legTable.operatingLabel', { from: from.iata, to: to.iata })}
                    >
                      {airlines.map((airline) => (
                        <option key={airline.iata} value={airline.iata}>
                          {airline.iata}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      aria-label={t('rtw.legTable.timingLabel', { from: from.iata, to: to.iata })}
                      value={
                        stopovers[index] === undefined
                          ? ''
                          : stopovers[index]
                            ? 'stopover'
                            : 'transfer'
                      }
                      onChange={(event) => {
                        const value = event.target.value;
                        onStopoverChange(index, value === '' ? undefined : value === 'stopover');
                      }}
                    >
                      <option value="">{t('rtw.timing.unknown')}</option>
                      <option value="transfer">{t('rtw.timing.transferLong')}</option>
                      <option value="stopover">{t('rtw.timing.stopoverLong')}</option>
                    </select>
                  </td>
                  <td>
                    <label className="rtw-leg-surface-toggle">
                      <input
                        type="checkbox"
                        aria-label={t('rtw.legTable.surfaceLabel', { from: from.iata, to: to.iata })}
                        checked={surfaces[index] === true}
                        onChange={(event) => onSurfaceChange(index, event.target.checked)}
                      />
                      {t('rtw.timing.surface')}
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
