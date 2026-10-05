/** Accessible language picker shared by the public site shell. */

import { useEffect, useId, useRef, useState } from 'react';
import { useLocaleState } from '../i18n/use-locale-state.ts';
import { LOCALE_LABELS, LOCALES, type Locale } from '../i18n/types.ts';

export function LanguagePicker(): React.ReactElement {
  const { locale, setLocale } = useLocaleState();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, LOCALES.indexOf(locale)));
  const pickerId = useId();
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const localeName = locale === 'zh-TW' ? '語言' : 'Language';
  const selectedLabel = LOCALE_LABELS[locale];

  useEffect(() => {
    if (!open) return undefined;
    listboxRef.current?.focus();
    const dismissOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !pickerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  const openPicker = (): void => {
    setActiveIndex(Math.max(0, LOCALES.indexOf(locale)));
    setOpen(true);
  };

  const chooseLocale = (nextLocale: Locale): void => {
    setLocale(nextLocale);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', nextLocale);
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      // Embedded/test environments may expose a nonstandard location.
    }
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex((index) => {
        if (event.key === 'Home') return 0;
        if (event.key === 'End') return LOCALES.length - 1;
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        return (index + delta + LOCALES.length) % LOCALES.length;
      });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const activeLocale = LOCALES[activeIndex];
      if (activeLocale) chooseLocale(activeLocale);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const query = event.key.toLocaleLowerCase();
      const match = LOCALES.findIndex((option) => LOCALE_LABELS[option].toLocaleLowerCase().startsWith(query));
      if (match >= 0) {
        event.preventDefault();
        setActiveIndex(match);
      }
    }
  };

  return (
    <div className="lang-picker" ref={pickerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="lang-picker-trigger"
        aria-label={`${localeName}: ${selectedLabel}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${pickerId}-listbox`}
        onClick={() => open ? setOpen(false) : openPicker()}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openPicker();
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      >
        <svg className="lang-picker-icon" aria-hidden="true" viewBox="0 0 20 20" focusable="false">
          <circle cx="10" cy="10" r="7.25" />
          <path d="M2.9 10h14.2M10 2.75c1.8 1.9 2.7 4.35 2.7 7.25s-.9 5.35-2.7 7.25C8.2 15.35 7.3 12.9 7.3 10s.9-5.35 2.7-7.25Z" />
        </svg>
        <span className="lang-picker-current">{selectedLabel}</span>
        <svg className="lang-picker-chevron" aria-hidden="true" viewBox="0 0 12 12" focusable="false">
          <path d="m3 4.5 3 3 3-3" />
        </svg>
      </button>
      {open && <div
        ref={listboxRef}
        id={`${pickerId}-listbox`}
        className="lang-picker-menu"
        role="listbox"
        aria-label={localeName}
        aria-activedescendant={`${pickerId}-option-${activeIndex}`}
        tabIndex={0}
        onKeyDown={handleListboxKeyDown}
      >
        {LOCALES.map((option, index) => (
          <div
            id={`${pickerId}-option-${index}`}
            key={option}
            className={`lang-picker-option${index === activeIndex ? ' is-active' : ''}`}
            role="option"
            aria-selected={option === locale}
            onPointerMove={() => setActiveIndex(index)}
            onClick={() => chooseLocale(option)}
          >
            <span>{LOCALE_LABELS[option]}</span>
            {option === locale && <svg className="lang-picker-check" aria-hidden="true" viewBox="0 0 16 16" focusable="false">
              <path d="m3.25 8.25 3 3 6.5-6.5" />
            </svg>}
          </div>
        ))}
      </div>}
    </div>
  );
}
