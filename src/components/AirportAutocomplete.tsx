/**
 * Autocomplete input for adding an airport to the leg chain.
 *
 *   typing → debounced search via AirportIndex → top 8 results dropdown
 *   Enter → commits highlighted (or top) result, calls onCommit, clears input
 *   ↓/↑ → navigate dropdown
 *   Esc → close dropdown + clear
 *
 * Supports:
 *   - IATA codes (SFO)
 *   - City names in English (Tokyo)
 *   - City names in user's locale (東京 for zh-TW)
 *   - City pseudo-codes (NYC, TYO, LON)
 *
 * On ambiguous prefix / city code, shows all matches; the user must click
 * or arrow-select. Never silently auto-picks an ambiguous result.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import type { AirportIndex, SearchResult } from '../lib/airport-index.ts';
import { resolveCityCode } from '../lib/city-codes.ts';
import type { Airport } from '../lib/types.ts';

interface Props {
  index: AirportIndex;
  onCommit: (airport: Airport) => void;
}

const DEBOUNCE_MS = 50;
const RESULT_LIMIT = 8;

export function AirportAutocomplete({ index, onCommit }: Props): React.ReactElement {
  const { locale, t } = useLocale();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const tt = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(tt);
  }, [query]);

  const results = useMemo<SearchResult[]>(() => {
    if (debounced.trim().length === 0) return [];
    return index.search(debounced, { limit: RESULT_LIMIT, locale });
  }, [index, debounced, locale]);

  const cityCodeHit = useMemo(() => {
    const q = debounced.trim().toUpperCase();
    return q.length === 3 ? resolveCityCode(q) : null;
  }, [debounced]);

  function commit(a: Airport): void {
    onCommit(a);
    setQuery('');
    setDebounced('');
    setOpen(false);
    setHighlight(0);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!open || results.length === 0) {
        // Allow Enter to commit on a clean 3-letter IATA match if dropdown isn't open.
        if (debounced.length === 3) {
          const exact = index.lookup(debounced);
          if (exact) commit(exact);
        }
        return;
      }
      // Refuse to auto-commit for ambiguous results (city codes, multi-airport cities).
      const top = results[0];
      if (top && (top.match === 'city-code' || cityCodeHit !== null)) {
        // User must explicitly pick one of the disambiguated airports.
        setOpen(true);
        return;
      }
      const chosen = results[highlight] ?? top;
      if (chosen) commit(chosen.airport);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      setDebounced('');
      setOpen(false);
    }
  }

  const showDropdown = open && results.length > 0;
  const ambiguous = results.length > 1 && debounced.trim().length >= 2;
  const showCityCodeHint = cityCodeHit !== null;

  return (
    <div className="autocomplete">
      <input
        ref={inputRef}
        type="text"
        className="autocomplete-input"
        placeholder={t('input.addAirportPlaceholderPro')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
      />
      {showDropdown && (
        <ul className="autocomplete-dropdown" role="listbox">
          {showCityCodeHint && (
            <li className="autocomplete-hint autocomplete-city-code-hint" aria-hidden="true">
              {t('input.cityCodeHint', { code: debounced.trim().toUpperCase() })}
            </li>
          )}
          {!showCityCodeHint && ambiguous && (
            <li className="autocomplete-hint" aria-hidden="true">
              {t('input.ambiguousHint', { count: results.length })}
            </li>
          )}
          {results.map((r, i) => (
            <li
              key={r.airport.iata}
              role="option"
              aria-selected={i === highlight}
              className={`autocomplete-row${i === highlight ? ' highlighted' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(r.airport);
              }}
            >
              <span className="autocomplete-iata">{r.airport.iata}</span>
              <span className="autocomplete-city">{r.airport.city}</span>
              <span className="autocomplete-name">{r.airport.name}</span>
              <span className="autocomplete-country">{r.airport.country}</span>
            </li>
          ))}
        </ul>
      )}
      {query.length > 0 && results.length === 0 && debounced.length > 0 && (
        <div className="autocomplete-empty" role="status">
          {t('input.noResults', { query: debounced })}
        </div>
      )}
    </div>
  );
}
