import { useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribeLocale } from './locale-state.ts';
import type { Locale } from './types.ts';

/** Lightweight locale subscription for the public shell; does not import message catalogs. */
export function useLocaleState(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
} {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  return { locale, setLocale };
}
