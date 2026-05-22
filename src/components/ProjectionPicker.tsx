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

const PROJECTIONS: Array<{ id: ProjectionId; icon: string; labelKey: string; tipKey: string }> = [
  { id: 'mercator', icon: '◫', labelKey: 'projection.mercator', tipKey: 'projection.mercatorTip' },
  { id: 'equirectangular', icon: '⊞', labelKey: 'projection.flat', tipKey: 'projection.flatTip' },
  { id: 'azimuthal-equidistant', icon: '◉', labelKey: 'projection.azimuthal', tipKey: 'projection.azimuthalTip' },
  { id: 'orthographic', icon: '◯', labelKey: 'projection.globe', tipKey: 'projection.globeTip' },
];

export function ProjectionPicker({ value, onChange }: Props): React.ReactElement {
  const { t } = useLocale();
  return (
    <div className="projection-picker" role="radiogroup" aria-label={t('projection.label')}>
      {PROJECTIONS.map((p) => (
        <button
          key={p.id}
          role="radio"
          aria-checked={value === p.id}
          type="button"
          className={`projection-picker-button${value === p.id ? ' active' : ''}`}
          onClick={() => onChange(p.id)}
          title={t(p.tipKey)}
        >
          <span className="projection-picker-icon" aria-hidden="true">
            {p.icon}
          </span>
          <span className="projection-picker-label">{t(p.labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
