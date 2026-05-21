/**
 * Cabin selector tabs (Y / W / J / F). Global to the routing.
 */

import { useLocale } from '../i18n/use-locale.ts';
import type { CabinId } from '../lib/types.ts';

interface Props {
  value: CabinId;
  onChange: (cabin: CabinId) => void;
  mode?: 'beginner' | 'pro';
}

const CABINS: Array<{ id: CabinId; letterKey: string; labelKey: string }> = [
  { id: 'economy', letterKey: 'cabin.economyShort', labelKey: 'cabin.economy' },
  { id: 'premium-economy', letterKey: 'cabin.premiumEconomyShort', labelKey: 'cabin.premiumEconomy' },
  { id: 'business', letterKey: 'cabin.businessShort', labelKey: 'cabin.business' },
  { id: 'first', letterKey: 'cabin.firstShort', labelKey: 'cabin.first' },
];

export function CabinSelector({ value, onChange, mode = 'beginner' }: Props): React.ReactElement {
  const { t } = useLocale();
  return (
    <div className="cabin-selector" role="tablist" aria-label={t('cabin.label')}>
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
            <span className="cabin-tab-letter">{t(cabin.letterKey)}</span>
            <span className="cabin-tab-label">
              {mode === 'pro' ? '' : t(cabin.labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
