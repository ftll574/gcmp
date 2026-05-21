import type en from './locales/en.json';

/**
 * The canonical message tree. All locales must satisfy this shape — TypeScript
 * enforces structural compatibility via the `LocaleMessages` type.
 */
export type LocaleMessages = typeof en;

export type Locale = 'en' | 'zh-TW';

export const LOCALES: ReadonlyArray<Locale> = ['en', 'zh-TW'];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  'zh-TW': '繁體中文',
};

/** Walks a nested message tree by dotted key (e.g. "panel.totalDistance"). */
export type MessagePath = string;
