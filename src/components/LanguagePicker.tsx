/**
 * Language picker — small select in the header.
 */

import { useLocaleState } from '../i18n/use-locale-state.ts';
import { LOCALE_LABELS, LOCALES, type Locale } from '../i18n/types.ts';

export function LanguagePicker(): React.ReactElement {
  const { locale, setLocale } = useLocaleState();
  return (
    <label className="lang-picker" aria-label={locale === 'zh-TW' ? '語言' : 'Language'}>
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
