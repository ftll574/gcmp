/**
 * Leg chain: draggable chips showing each airport in the routing, with a
 * per-leg operating-carrier dropdown and per-leg fare-class chip.
 *
 *   [SFO ✈ AA J] [NRT ✈ JL D] [BKK ✈ CX I] [HKG]
 *               ↑drag handle    ↑× removes the airport
 *
 * The carrier + fare-class badges appear on EVERY chip except the last
 * one. Fare-class is a single letter A-Z; when set, the engine looks up
 * the carrier's exact bucket (CX I=25%, CX J=150%, etc.). When unset
 * (default), the engine falls back to the carrier's
 * defaultLetterByCabin[cabin] — i.e., v1.5+ behavior is opt-in.
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import type { Airline, AirlineIata, Airport, Iata } from '../lib/types.ts';

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
  /** Operating carriers per leg. Length = airports.length - 1. */
  operatingCarriers: ReadonlyArray<AirlineIata>;
  /** Per-leg explicit fare-class override. undefined = use cabin default. */
  fareClasses: ReadonlyArray<string | undefined>;
  /** Per-leg stopover marker. undefined = timing unknown. */
  stopovers: ReadonlyArray<boolean | undefined>;
  /** Per-leg surface/open-jaw marker. */
  surfaces: ReadonlyArray<boolean | undefined>;
  /** Pool of carriers for the badge dropdown. */
  airlines: ReadonlyArray<Airline>;
  onReorder: (newOrder: ReadonlyArray<Iata>) => void;
  onRemove: (iata: Iata, index: number) => void;
  onCarrierChange: (legIndex: number, carrier: AirlineIata) => void;
  /** Set undefined to clear the override (let cabin default apply). */
  onFareClassChange: (legIndex: number, fareClass: string | undefined) => void;
  onStopoverChange: (legIndex: number, stopover: boolean | undefined) => void;
  onSurfaceChange: (legIndex: number, surface: boolean) => void;
}

export function LegChain({
  airports,
  operatingCarriers,
  fareClasses,
  stopovers,
  surfaces,
  airlines,
  onReorder,
  onRemove,
  onCarrierChange,
  onFareClassChange,
  onStopoverChange,
  onSurfaceChange,
}: Props): React.ReactElement {
  const { t } = useLocale();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

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
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isFinite(from) && from !== i) {
      const next = airports.slice();
      const [moved] = next.splice(from, 1);
      if (moved) next.splice(i, 0, moved);
      onReorder(next.map((a) => a.iata));
    }
    setDragIndex(null);
    setOverIndex(null);
  }
  function handleDragEnd(): void {
    setDragIndex(null);
    setOverIndex(null);
  }

  return (
    <ol className="leg-chain" aria-label="Routing legs">
      {airports.map((airport, i) => {
        const isLast = i === airports.length - 1;
        const legIndex = i;
        const carrier = !isLast ? operatingCarriers[legIndex] : undefined;
        const klass = [
          'leg-chip',
          dragIndex === i ? 'dragging' : '',
          overIndex === i ? 'drag-over' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li
            key={`${airport.iata}-${i}`}
            className={klass}
            draggable
            onDragStart={(e) => handleDragStart(i, e)}
            onDragOver={(e) => handleDragOver(i, e)}
            onDrop={(e) => handleDrop(i, e)}
            onDragEnd={handleDragEnd}
            aria-label={t('leg.ariaLabel', {
              n: i + 1,
              total: airports.length,
              from: airport.iata,
              to: airport.city,
            })}
          >
            <span className="leg-chip-handle" aria-hidden="true">⋮⋮</span>
            <span className="leg-chip-iata">{airport.iata}</span>
            <span className="leg-chip-city">{airport.city}</span>
            <button
              type="button"
              className="leg-chip-remove"
              aria-label={t('leg.remove', { iata: airport.iata })}
              onClick={() => onRemove(airport.iata, i)}
            >
              ×
            </button>
            {!isLast && carrier !== undefined && (
              <span className="leg-chip-carrier-wrap">
                <span className="leg-chip-arrow" aria-hidden="true">→</span>
                <select
                  className="leg-chip-carrier"
                  value={carrier}
                  onChange={(e) => onCarrierChange(legIndex, e.target.value.toUpperCase())}
                  aria-label={t('leg.carrierLabel', { n: legIndex + 1 })}
                >
                  {airlines.map((al) => (
                    <option key={al.iata} value={al.iata}>
                      {al.iata}
                    </option>
                  ))}
                </select>
                <select
                  className={`leg-chip-fareclass${fareClasses[legIndex] ? ' has-override' : ''}`}
                  value={fareClasses[legIndex] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    onFareClassChange(legIndex, v === '' ? undefined : v);
                  }}
                  aria-label={t('leg.fareClassLabel', { n: legIndex + 1 })}
                  title={t('leg.fareClassTitle')}
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
                </select>
                <select
                  className={`leg-chip-stopover${stopovers[legIndex] !== undefined ? ' is-set' : ''}`}
                  value={
                    stopovers[legIndex] === undefined
                      ? ''
                      : stopovers[legIndex]
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
                  className={`leg-chip-surface${surfaces[legIndex] === true ? ' is-surface' : ''}`}
                  title={t('rtw.legChip.surfaceTitle')}
                >
                  <input
                    type="checkbox"
                    checked={surfaces[legIndex] === true}
                    onChange={(e) => onSurfaceChange(legIndex, e.target.checked)}
                  />
                  {t('rtw.timing.surface')}
                </label>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
