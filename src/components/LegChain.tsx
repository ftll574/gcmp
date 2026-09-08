/**
 * Route chain rendered one PHYSICAL LEG per row. The airport pair is the
 * primary object (TPE → CNX); flight/cabin/timing are secondary metadata for
 * that row rather than a control inserted between two airport rows.
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import {
  isFlightLeg,
  isSurfaceLeg,
  type Airline,
  type AirlineIata,
  type Airport,
  type CabinId,
  type Iata,
  type Leg,
} from '../lib/types.ts';

/**
 * Fare-class letters offered in the picker. Grouped by likely cabin in
 * the rendered <optgroup>. A-Z is a superset of what any one carrier has;
 * the engine handles missing buckets with a "no rule for {OP} {X}" note.
 */
const FARE_CLASS_GROUPS: ReadonlyArray<{ label: string; letters: ReadonlyArray<string> }> = [
  { label: 'First', letters: ['F', 'A', 'P', 'R'] },
  { label: 'Business', letters: ['J', 'C', 'D', 'I', 'Z'] },
  { label: 'Premium Economy', letters: ['W', 'E', 'T', 'O'] },
  { label: 'Economy', letters: ['Y', 'B', 'M', 'H', 'K', 'L', 'Q', 'V', 'S', 'N', 'G', 'X'] },
];

interface Props {
  /** Airports in the chain, in order. */
  airports: ReadonlyArray<Airport>;
  /** Canonical per-segment model. Surface legs contain no flight metadata. */
  legs: ReadonlyArray<Leg>;
  /** Pool of carriers for the badge dropdown. */
  airlines: ReadonlyArray<Airline>;
  onReorder: (airportOccurrenceOrder: ReadonlyArray<number>) => void;
  onRemove: (iata: Iata, index: number) => void;
  onCarrierChange: (legIndex: number, carrier: AirlineIata) => void;
  onCabinChange: (legIndex: number, cabin: CabinId | undefined) => void;
  /** Set undefined to clear the override (let cabin default apply). */
  onFareClassChange: (legIndex: number, fareClass: string | undefined) => void;
  onStopoverChange: (legIndex: number, stopover: boolean | undefined) => void;
  onSurfaceChange: (legIndex: number, surface: boolean) => void;
}

export function LegChain({
  airports,
  legs,
  airlines,
  onReorder,
  onRemove,
  onCarrierChange,
  onCabinChange,
  onFareClassChange,
  onStopoverChange,
  onSurfaceChange,
}: Props): React.ReactElement {
  const { t } = useLocale();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [expandedLegIndex, setExpandedLegIndex] = useState<number | null>(null);

  function handleDragStart(i: number, e: React.DragEvent<HTMLLIElement>): void {
    setDragIndex(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  }
  function handleDragOver(i: number, e: React.DragEvent<HTMLLIElement>): void {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== i) setOverIndex(i);
  }
  function handleDrop(i: number, e: React.DragEvent<HTMLLIElement>): void {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    const from = Number(raw);
    if (raw !== '' && Number.isInteger(from) && from >= 0 && from < airports.length && from !== i) {
      const next = airports.map((_, index) => index);
      const [moved] = next.splice(from, 1);
      if (moved !== undefined) next.splice(i, 0, moved);
      onReorder(next);
    }
    setDragIndex(null);
    setOverIndex(null);
  }
  function handleDragEnd(): void {
    setDragIndex(null);
    setOverIndex(null);
  }

  if (airports.length === 1) {
    const airport = airports[0]!;
    return (
      <ol className="leg-chain" aria-label="Routing legs">
        <li className="leg-chip leg-chip-start" data-route-start={airport.iata}>
          <div className="leg-chip-route-line">
            <span className="leg-chip-handle is-placeholder" aria-hidden="true">⋮⋮</span>
            <span className="leg-chip-route-airports">
              <strong className="leg-chip-iata">{airport.iata}</strong>
            </span>
            <span className="leg-chip-city">{airport.city}</span>
            <button
              type="button"
              className="leg-chip-remove"
              aria-label={t('leg.remove', { iata: airport.iata })}
              onClick={() => onRemove(airport.iata, 0)}
            >
              ×
            </button>
          </div>
        </li>
      </ol>
    );
  }

  return (
    <ol className="leg-chain" aria-label="Routing legs">
      {airports.slice(0, -1).map((airport, i) => {
        const toAirport = airports[i + 1]!;
        const legIndex = i;
        const destinationIndex = i + 1;
        const leg = legs[legIndex];
        if (!leg) return null;
        const flight = isFlightLeg(leg) ? leg : null;
        const isSurface = isSurfaceLeg(leg);
        const isManual = flight?.manual === true;
        const isEditingLeg = expandedLegIndex === legIndex;
        const timingSummary = leg.stopover === undefined
          ? t('rtw.timing.unknownShort')
          : leg.stopover
            ? t('rtw.timing.stopover')
            : t('rtw.timing.transfer');
        const klass = [
          'leg-chip',
          isSurface ? 'is-surface' : '',
          isManual ? 'is-manual' : '',
          dragIndex === i ? 'dragging' : '',
          overIndex === i ? 'drag-over' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li
            key={`${airport.iata}-${toAirport.iata}-${i}`}
            className={klass}
            data-leg-route={`${airport.iata}-${toAirport.iata}`}
            draggable
            onDragStart={(e) => handleDragStart(destinationIndex, e)}
            onDragOver={(e) => handleDragOver(destinationIndex, e)}
            onDrop={(e) => handleDrop(destinationIndex, e)}
            onDragEnd={handleDragEnd}
            aria-label={`${airport.iata} → ${toAirport.iata}`}
          >
            <div className="leg-chip-route-line">
              <span className="leg-chip-handle" aria-hidden="true">⋮⋮</span>
              <span className="leg-chip-route-airports">
                <strong className="leg-chip-iata">{airport.iata}</strong>
                <span className="leg-chip-route-arrow" aria-hidden="true">{isSurface ? '⇢' : '→'}</span>
                <strong className="leg-chip-iata">{toAirport.iata}</strong>
                {isManual && <span className="leg-chip-unverified" data-leg-manual>{t('rtw.legChip.unverifiedRoute')}</span>}
              </span>
              <span className="leg-chip-city">{airport.city} → {toAirport.city}</span>
              <span className="leg-chip-route-actions">
                {i === 0 && (
                  <button
                    type="button"
                    className="leg-chip-remove leg-chip-remove-origin"
                    aria-label={t('leg.remove', { iata: airport.iata })}
                    onClick={() => onRemove(airport.iata, i)}
                  >
                    ×
                  </button>
                )}
                <button
                  type="button"
                  className="leg-chip-remove leg-chip-remove-destination"
                  aria-label={t('leg.remove', { iata: toAirport.iata })}
                  onClick={() => onRemove(toAirport.iata, destinationIndex)}
                >
                  ×
                </button>
              </span>
            </div>
            {(
              <>
                <button
                  type="button"
                  className={`leg-chip-summary${isEditingLeg ? ' is-open' : ''}`}
                  aria-expanded={isEditingLeg}
                  aria-label={t('rtw.workflow.editLeg', { n: legIndex + 1 })}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => setExpandedLegIndex(isEditingLeg ? null : legIndex)}
                >
                  <span className="leg-chip-summary-main">
                    <strong>{flight ? `${flight.operatingCarrier}${flight.flightNumber ?? ''}` : t('rtw.timing.surface')}</strong>
                  </span>
                  <span className="leg-chip-summary-meta">
                    {flight
                      ? `${flight.cabin ? t(`cabin.${flight.cabin === 'premium-economy' ? 'premiumEconomyShort' : `${flight.cabin}Short`}`) : t('rtw.legChip.cabinUnset')} · ${timingSummary}${flight.fareClass ? ` · ${flight.fareClass}` : ''}`
                      : timingSummary}
                  </span>
                  <span className="leg-chip-summary-toggle" aria-hidden="true">{isEditingLeg ? '−' : '+'}</span>
                </button>
                <span className={`leg-chip-carrier-wrap${isEditingLeg ? ' is-open' : ''}`}>
                  <span className="leg-chip-arrow" aria-hidden="true">→</span>
                  {flight && <select
                    className="leg-chip-carrier"
                    value={flight.operatingCarrier}
                    onChange={(e) => onCarrierChange(legIndex, e.target.value.toUpperCase())}
                    aria-label={t('leg.carrierLabel', { n: legIndex + 1 })}
                    aria-invalid={!airlines.some((airline) => airline.iata === flight.operatingCarrier)}
                  >
                    {!airlines.some((airline) => airline.iata === flight.operatingCarrier) && (
                      <option value={flight.operatingCarrier}>{flight.operatingCarrier} · {t('rtw.integrity.ineligibleCarrier')}</option>
                    )}
                    {airlines.map((al) => (
                      <option key={al.iata} value={al.iata}>
                        {al.iata}
                      </option>
                    ))}
                  </select>}
                  {flight?.flightNumber && (
                    <span className="leg-chip-flight-number" data-flight-number={`${flight.operatingCarrier}${flight.flightNumber}`}>
                      {flight.operatingCarrier}{flight.flightNumber}
                    </span>
                  )}
                  {flight && <select
                    className={`leg-chip-cabin${flight.cabin ? ' is-set' : ''}`}
                    value={flight.cabin ?? ''}
                    onChange={(event) => {
                      const value = event.target.value as CabinId | '';
                      onCabinChange(legIndex, value === '' ? undefined : value);
                    }}
                    aria-label={t('rtw.legChip.cabinLabel', { n: legIndex + 1 })}
                  >
                    <option value="">{t('rtw.legChip.cabinUnset')}</option>
                    <option value="economy">{t('cabin.economy')}</option>
                    <option value="premium-economy">{t('cabin.premiumEconomy')}</option>
                    <option value="business">{t('cabin.business')}</option>
                    <option value="first">{t('cabin.first')}</option>
                  </select>}
                  {flight?.fareClass !== undefined && <select
                    className={`leg-chip-fareclass${flight.fareClass ? ' has-override' : ''}`}
                    value={flight.fareClass ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      onFareClassChange(legIndex, v === '' ? undefined : v);
                    }}
                    aria-label={t('leg.fareClassLabel', { n: legIndex + 1 })}
                    title={t('rtw.integrity.legacyBookingCode')}
                  >
                    <option value="">{t('leg.fareClassAuto')}</option>
                    {FARE_CLASS_GROUPS.map((g) => (
                      <optgroup key={g.label} label={g.label}>
                        {g.letters.map((letter) => (
                          <option key={letter} value={letter}>
                            {letter}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>}
                  <select
                    className={`leg-chip-stopover${leg.stopover !== undefined ? ' is-set' : ''}`}
                    value={
                      leg.stopover === undefined
                        ? ''
                        : leg.stopover
                          ? 'stopover'
                          : 'transfer'
                    }
                    onChange={(e) => {
                      const v = e.target.value;
                      onStopoverChange(legIndex, v === '' ? undefined : v === 'stopover');
                    }}
                    aria-label={t('rtw.legChip.stopoverLabel', { n: legIndex + 1 })}
                    title={t('rtw.legChip.stopoverTitle')}
                  >
                    <option value="">{t('rtw.timing.unknownShort')}</option>
                    <option value="transfer">{t('rtw.timing.transfer')}</option>
                    <option value="stopover">{t('rtw.timing.stopover')}</option>
                  </select>
                  <label
                    className={`leg-chip-surface${isSurface ? ' is-surface' : ''}`}
                    title={t('rtw.legChip.surfaceTitle')}
                  >
                    <input
                      type="checkbox"
                      checked={isSurface}
                      onChange={(e) => onSurfaceChange(legIndex, e.target.checked)}
                    />
                    {t('rtw.timing.surface')}
                  </label>
                </span>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
