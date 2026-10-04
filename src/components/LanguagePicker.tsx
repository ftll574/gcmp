/**
 * Language picker — small select in the header.
 */

import { useLocaleState } from '../i18n/use-locale-state.ts';
import { LOCALE_LABELS, LOCALES, type Locale } from '../i18n/types.ts';

export function LanguagePicker(): React.ReactElement {
  const { locale, setLocale } = useLocaleState();
  return (
    <label className="lang-picker" aria-label={locale === 'zh-TW' ? '語言' : 'Language'}>
      <svg className="lang-picker-icon" aria-hidden="true" viewBox="0 0 16 16" focusable="false">
        <circle cx="8" cy="8" r="6.2" />
        <path d="M1.9 8h12.2M8 1.8c1.6 1.7 2.4 3.8 2.4 6.2S9.6 12.5 8 14.2C6.4 12.5 5.6 10.4 5.6 8S6.4 3.5 8 1.8Z" />
      </svg>
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
