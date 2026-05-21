/**
 * Cabin selector tabs (Y / W / J / F). Global to the routing.
 */

import type { CabinId } from '../lib/types.ts';

const CABINS: Array<{ id: CabinId; letter: string; label: string }> = [
  { id: 'economy', letter: 'Y', label: 'Economy' },
  { id: 'premium-economy', letter: 'W', label: 'Premium' },
  { id: 'business', letter: 'J', label: 'Business' },
  { id: 'first', letter: 'F', label: 'First' },
];

interface Props {
  value: CabinId;
  onChange: (cabin: CabinId) => void;
}

export function CabinSelector({ value, onChange }: Props): React.ReactElement {
  return (
    <div className="cabin-selector" role="tablist" aria-label="Cabin class">
      {CABINS.map((cabin) => {
        const selected = value === cabin.id;
        return (
          <button
            key={cabin.id}
            role="tab"
            aria-selected={selected}
            className={`cabin-tab${selected ? ' selected' : ''}`}
            onClick={() => onChange(cabin.id)}
            type="button"
          >
            <span className="cabin-tab-letter">{cabin.letter}</span>
            <span className="cabin-tab-label">{cabin.label}</span>
          </button>
        );
      })}
    </div>
  );
}
