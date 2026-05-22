/**
 * ProgramPicker — popover for selecting which loyalty programs the routing
 * earns into. Replaces the v1.2 hardcoded 2-button ProgramToggle.
 *
 *   Closed state:   inline summary chip ("AA · AS  ▾") showing active programs
 *   Open state:     popover with programs grouped by alliance, checkboxes
 *
 * Constraints:
 *   - At least 1 program must remain selected (UI prevents unchecking last)
 *   - Soft cap at 6 selected — UI keeps the checkbox enabled but renders a
 *     warning row so the user knows the earning panel will get cluttered
 *   - PROGRAM_REGISTRY is the source of truth; this component renders whatever
 *     is in there, grouped by alliance
 *
 * Keyboard / a11y:
 *   - Trigger button is `aria-expanded` + `aria-haspopup="listbox"`
 *   - Esc closes; click outside closes
 *   - Checkboxes are native <input type=checkbox>, so screen readers get
 *     standard semantics
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import {
  PROGRAM_REGISTRY,
  PROGRAM_SHORT_BY_ID,
  type Alliance,
  type ProgramId,
  type ProgramRegistryEntry,
} from '../lib/types.ts';

const ALLIANCE_ORDER: ReadonlyArray<Alliance> = ['oneworld', 'star', 'skyteam', 'none'];

/** Soft cap: above this, show a hint that the panel will be busy. Hard cap = total registry size. */
const SOFT_CAP = 6;

interface Props {
  active: ReadonlyArray<ProgramId>;
  onToggle: (id: ProgramId) => void;
}

export function ProgramPicker({ active, onToggle }: Props): React.ReactElement {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Programs grouped by alliance — built once per registry change (i.e. never at runtime).
  const groupedByAlliance = useMemo<Record<Alliance, ProgramRegistryEntry[]>>(() => {
    const out: Record<Alliance, ProgramRegistryEntry[]> = {
      oneworld: [],
      star: [],
      skyteam: [],
      none: [],
    };
    for (const entry of PROGRAM_REGISTRY) {
      out[entry.alliance].push(entry);
    }
    return out;
  }, []);

  const activeSet = useMemo(() => new Set(active), [active]);
  const tooMany = active.length > SOFT_CAP;

  // Close on outside click + Esc.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (!rootRef.current) return;
      if (e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function handleCheckbox(id: ProgramId, checked: boolean): void {
    // Prevent unchecking the last one.
    if (!checked && activeSet.size === 1 && activeSet.has(id)) {
      return;
    }
    onToggle(id);
  }

  // Active chip summary — show short codes (AA · AS).
  const summary = active
    .map((id) => PROGRAM_SHORT_BY_ID[id] ?? id.toUpperCase().slice(0, 2))
    .join(' · ');

  return (
    <div className="program-picker" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="program-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('programPicker.label')}
        onClick={() => setOpen((x) => !x)}
      >
        <span className="program-picker-summary">{summary || t('programPicker.none')}</span>
        <span className="program-picker-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open && (
        <div className="program-picker-popover" role="dialog" aria-label={t('programPicker.label')}>
          <p className="program-picker-hint">{t('programPicker.hint')}</p>
          {tooMany && (
            <p className="program-picker-warn" role="status">
              ⚠ {t('programPicker.tooMany', { count: String(active.length) })}
            </p>
          )}
          {ALLIANCE_ORDER.map((alliance) => {
            const entries = groupedByAlliance[alliance];
            if (entries.length === 0) return null;
            return (
              <section key={alliance} className="program-picker-group">
                <h4 className="program-picker-alliance">{t(`alliance.${alliance}`)}</h4>
                <ul className="program-picker-list">
                  {entries.map((entry) => {
                    const on = activeSet.has(entry.id);
                    const isLastActive = on && activeSet.size === 1;
                    return (
                      <li key={entry.id}>
                        <label
                          className={`program-picker-row${on ? ' active' : ''}${isLastActive ? ' locked' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={isLastActive}
                            onChange={(e) => handleCheckbox(entry.id, e.target.checked)}
                          />
                          <span className="program-picker-short">{entry.shortCode}</span>
                          <span className="program-picker-name">{entry.label}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
