/**
 * Projection picker — toggle between Mercator, Equirectangular, Azimuthal
 * Equidistant (gcmap classic), and Orthographic (globe).
 */

import { useLocale } from '../i18n/use-locale.ts';
import type { ProjectionId } from '../lib/calc/projections.ts';

interface Props {
  value: ProjectionId;
  onChange: (next: ProjectionId) => void;
}

const PROJECTIONS: Array<{ id: ProjectionId; iconKey: string; labelKey: string }> = [
  { id: 'mercator', iconKey: '◫', labelKey: 'Mercator' },
  { id: 'equirectangular', iconKey: '⊞', labelKey: 'Flat' },
  { id: 'azimuthal-equidistant', iconKey: '◉', labelKey: 'Azimuthal' },
  { id: 'orthographic', iconKey: '◯', labelKey: 'Globe' },
];

export function ProjectionPicker({ value, onChange }: Props): React.ReactElement {
  const { t: _t } = useLocale();
  void _t; // future i18n keys go here
  return (
    <div className="projection-picker" role="radiogroup" aria-label="Map projection">
      {PROJECTIONS.map((p) => (
        <button
          key={p.id}
          role="radio"
          aria-checked={value === p.id}
          type="button"
          className={`projection-picker-button${value === p.id ? ' active' : ''}`}
          onClick={() => onChange(p.id)}
          title={p.labelKey}
        >
          <span className="projection-picker-icon" aria-hidden="true">
            {p.iconKey}
          </span>
          <span className="projection-picker-label">{p.labelKey}</span>
        </button>
      ))}
    </div>
  );
}
