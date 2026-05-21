/**
 * Beginner / Pro mode toggle. Lives in the header next to the language picker.
 */

import { useLocale } from '../i18n/use-locale.ts';
import type { AppMode } from '../state/use-mode.ts';

interface Props {
  mode: AppMode;
  onChange: (next: AppMode) => void;
}

export function ModeToggle({ mode, onChange }: Props): React.ReactElement {
  const { t } = useLocale();
  return (
    <div className="mode-toggle" role="radiogroup" aria-label={t('header.modeHint')}>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'beginner'}
        className={`mode-toggle-button${mode === 'beginner' ? ' active' : ''}`}
        onClick={() => onChange('beginner')}
      >
        {t('header.modeBeginner')}
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === 'pro'}
        className={`mode-toggle-button${mode === 'pro' ? ' active' : ''}`}
        onClick={() => onChange('pro')}
      >
        {t('header.modePro')}
      </button>
    </div>
  );
}
