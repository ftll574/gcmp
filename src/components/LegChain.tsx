/**
 * Leg chain: draggable chips showing each airport in the routing, with a
 * per-leg operating-carrier dropdown.
 *
 *   [SFO ✈ AA] [NRT ✈ JL] [BKK ✈ CX] [HKG]
 *               ↑drag handle    ↑× removes the airport
 *
 * The carrier badge appears on EVERY chip except the last one (since the
 * last airport has no outgoing leg). Click the badge to open a small
 * carrier dropdown.
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import type { Airline, AirlineIata, Airport, Iata } from '../lib/types.ts';

interface Props {
  /** Airports in the chain, in order. */
  airports: ReadonlyArray<Airport>;
  /** Operating carriers per leg. Length = airports.length - 1. */
  operatingCarriers: ReadonlyArray<AirlineIata>;
  /** Pool of carriers for the badge dropdown. */
  airlines: ReadonlyArray<Airline>;
  onReorder: (newOrder: ReadonlyArray<Iata>) => void;
  onRemove: (iata: Iata, index: number) => void;
  onCarrierChange: (legIndex: number, carrier: AirlineIata) => void;
}

export function LegChain({
  airports,
  operatingCarriers,
  airlines,
  onReorder,
  onRemove,
  onCarrierChange,
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
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
