/**
 * useLocale — React hook around the i18n module's locale state.
 *
 *   const { locale, setLocale, t } = useLocale();
 *
 * Re-renders subscribers when setLocale is called from anywhere in the app
 * (or via the URL on first load).
 */

import { useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribeLocale, t } from './i18n.ts';
import type { Locale } from './types.ts';

export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: typeof t;
} {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return { locale, setLocale, t };
}
