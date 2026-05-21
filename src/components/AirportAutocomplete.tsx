/**
 * Autocomplete input for adding an airport to the leg chain.
 *
 *   typing → debounced search via AirportIndex → top 8 results dropdown
 *   Enter → commits highlighted (or top) result, calls onCommit, clears input
 *   ↓/↑ → navigate dropdown
 *   Esc → close dropdown + clear
 *
 * On ambiguous prefix (e.g. "LON" → LHR/LGW/STN), shows all matches; the
 * user must click or arrow-select. No silent auto-pick on ambiguous codes.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { AirportIndex } from '../lib/airport-index.ts';
import type { Airport } from '../lib/types.ts';

interface Props {
  index: AirportIndex;
  onCommit: (airport: Airport) => void;
  placeholder?: string;
}

const DEBOUNCE_MS = 50;
const RESULT_LIMIT = 8;

export function AirportAutocomplete({ index, onCommit, placeholder }: Props): React.ReactElement {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query]);

  const results = useMemo<Airport[]>(() => {
    if (debounced.trim().length === 0) return [];
    return index.search(debounced, RESULT_LIMIT);
  }, [index, debounced]);

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
        // Allow Enter to commit the top exact-match if user typed full IATA.
        if (debounced.length === 3) {
          const exact = index.lookup(debounced);
          if (exact) commit(exact);
        }
        return;
      }
      const chosen = results[highlight] ?? results[0];
      if (chosen) commit(chosen);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      setDebounced('');
      setOpen(false);
    }
  }

  const showDropdown = open && results.length > 0;
  const ambiguous = results.length > 1 && debounced.length >= 2;

  return (
    <div className="autocomplete">
      <input
        ref={inputRef}
        type="text"
        className="autocomplete-input"
        placeholder={placeholder ?? 'Add airport (IATA code, e.g. SFO)'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          // Delay so click on dropdown registers.
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
          {ambiguous && (
            <li className="autocomplete-hint" aria-hidden="true">
              {results.length} matches — select one
            </li>
          )}
          {results.map((a, i) => (
            <li
              key={a.iata}
              role="option"
              aria-selected={i === highlight}
              className={`autocomplete-row${i === highlight ? ' highlighted' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(a);
              }}
            >
              <span className="autocomplete-iata">{a.iata}</span>
              <span className="autocomplete-city">{a.city}</span>
              <span className="autocomplete-name">{a.name}</span>
              <span className="autocomplete-country">{a.country}</span>
            </li>
          ))}
        </ul>
      )}
      {query.length > 0 && results.length === 0 && debounced.length > 0 && (
        <div className="autocomplete-empty" role="status">
          No airport found for &ldquo;{debounced}&rdquo;. Try the city name.
        </div>
      )}
    </div>
  );
}
