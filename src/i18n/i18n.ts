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
import { LOCALES, type Locale, type LocaleMessages } from './types.ts';

const MESSAGES: Record<Locale, LocaleMessages> = {
  en,
  'zh-TW': zhTW,
};

const STORAGE_KEY = 'gcmp.locale';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as ReadonlyArray<string>).includes(value);
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';

  // 1. URL ?lang=...
  try {
    const u = new URL(window.location.href);
    const fromQuery = u.searchParams.get('lang');
    if (isLocale(fromQuery)) return fromQuery;
  } catch {
    // ignore
  }

  // 2. localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // ignore
  }

  // 3. navigator.language
  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language;
    if (isLocale(lang)) return lang;
    // Match prefix.
    if (lang.startsWith('zh-Hant') || lang.startsWith('zh-TW') || lang.startsWith('zh-HK')) return 'zh-TW';
    const prefix = lang.split('-')[0];
    // Taiwan-first: any other Chinese variant (zh-Hans/zh-CN/zh) defaults to
    // Traditional Chinese; everything non-Chinese falls back to English.
    if (prefix === 'zh') return 'zh-TW';
    if (prefix === 'en') return 'en';
  }

  return 'en';
}

let currentLocale: Locale = detectLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  if (currentLocale === locale) return;
  currentLocale = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // ignore quota / privacy mode
  }
  // Also reflect in <html lang="...">
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
  for (const l of listeners) l();
}

export function subscribeLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// Set <html lang> on first import.
if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLocale;
}

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
  const locale = currentLocale;
  let value = pick(MESSAGES[locale], key);
  if (typeof value !== 'string') {
    // Fall back to English.
    value = pick(MESSAGES.en, key);
  }
  if (typeof value !== 'string') return key;
  return params ? interpolate(value, params) : value;
}
