/**
 * "Import from gcmap" — a small expandable affordance that lets the user
 * paste an existing gcmap URL or a bare paths string like "SFO-NRT,JFK-LHR".
 * The user gets a one-click migration path from the old gcmap they used.
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import { isGcmapUrl, parseGcmapUrl } from '../lib/gcmap-compat.ts';
import type { RoutingRequest } from '../lib/types.ts';

interface Props {
  onImport: (req: RoutingRequest) => void;
}

export function ImportFromGcmap({ onImport }: Props): React.ReactElement {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function attemptImport(): void {
    const parsed = parseGcmapUrl(value);
    if (!parsed) {
      setError(t('gcmapImport.invalid'));
      return;
    }
    setError(null);
    setValue('');
    setOpen(false);
    onImport(parsed);
  }

  if (!open) {
    return (
      <button type="button" className="gcmap-import-toggle" onClick={() => setOpen(true)}>
        {t('gcmapImport.open')}
      </button>
    );
  }

  return (
    <div className="gcmap-import">
      <label htmlFor="gcmap-import-input" className="gcmap-import-label">
        {t('gcmapImport.label')}
      </label>
      <input
        id="gcmap-import-input"
        type="text"
        className="gcmap-import-input"
        placeholder="SFO-NRT-BKK,JFK-LHR-CDG"
        value={value}
        autoFocus
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') attemptImport();
          if (e.key === 'Escape') {
            setOpen(false);
            setValue('');
            setError(null);
          }
        }}
      />
      <div className="gcmap-import-actions">
        <button
          type="button"
          className="action-button primary"
          onClick={attemptImport}
          disabled={value.trim().length === 0 || !isGcmapUrl(value.trim())}
        >
          {t('gcmapImport.import')}
        </button>
        <button
          type="button"
          className="action-button"
          onClick={() => {
            setOpen(false);
            setValue('');
            setError(null);
          }}
        >
          {t('save.cancel')}
        </button>
      </div>
      <p className="gcmap-import-hint">{t('gcmapImport.hint')}</p>
      {error && (
        <p className="gcmap-import-error" role="alert">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
