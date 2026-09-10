import { LOCALES, type Locale } from './types.ts';

const STORAGE_KEY = 'gcmp.locale';

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as ReadonlyArray<string>).includes(value);
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';

  try {
    const url = new URL(window.location.href);
    const fromQuery = url.searchParams.get('lang');
    if (isLocale(fromQuery)) return fromQuery;
  } catch {
    // Ignore malformed URLs in embedded/test environments.
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Ignore quota/privacy-mode failures.
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    const lang = navigator.language;
    if (isLocale(lang)) return lang;
    if (lang.startsWith('zh-Hant') || lang.startsWith('zh-TW') || lang.startsWith('zh-HK')) return 'zh-TW';
    const prefix = lang.split('-')[0];
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
    // Ignore quota/privacy-mode failures.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
  for (const listener of listeners) listener();
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof document !== 'undefined') document.documentElement.lang = currentLocale;
