/**
 * Hand-rolled i18n. No react-i18next dep — keeps the bundle small.
 *
 *   t('rtw.validationTitle')                   → "Route rule check"
 *   t('leg.ariaLabel', { n: 1, total: 3, ... }) → "Leg 1 of 3: SFO to NRT"
 *
 * Locale detection order:
 *   1. URL query `?lang=zh-TW`
 *   2. localStorage `gcmp.locale`
 *   3. navigator.language (matched against supported locales)
 *   4. 'en' fallback
 *
 * Locale is stored in localStorage so it persists across visits. The
 * useLocale() hook re-renders subscribers when the locale changes.
 */

import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';
import { getLocale } from './locale-state.ts';
import type { Locale, LocaleMessages } from './types.ts';

export { getLocale, setLocale, subscribeLocale } from './locale-state.ts';

const MESSAGES: Record<Locale, LocaleMessages> = {
  en,
  'zh-TW': zhTW,
};

/** Walk a nested object by dotted key path. Returns undefined if not found. */
function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Interpolate `{name}` placeholders. */
function interpolate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    return value === undefined ? `{${name}}` : String(value);
  });
}

/**
 * Translate a message key. Falls back to English, then to the key itself,
 * so the UI never shows raw `undefined` even if a locale is missing a key.
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  const locale = getLocale();
  let value = pick(MESSAGES[locale], key);
  if (typeof value !== 'string') {
    // Fall back to English.
    value = pick(MESSAGES.en, key);
  }
  if (typeof value !== 'string') return key;
  return params ? interpolate(value, params) : value;
}
