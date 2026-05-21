/**
 * Language picker — small select in the header.
 */

import { useLocale } from '../i18n/use-locale.ts';
import { LOCALE_LABELS, LOCALES, type Locale } from '../i18n/types.ts';

export function LanguagePicker(): React.ReactElement {
  const { locale, setLocale, t } = useLocale();
  return (
    <label className="lang-picker" aria-label={t('lang.label')}>
      <span className="lang-picker-icon" aria-hidden="true">🌐</span>
      <select
        className="lang-picker-select"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
