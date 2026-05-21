/**
 * Save / Share URL action row. "Copy as FlyerTalk post" was cut per
 * eng review OV7 (thesis contradiction — if the tool replaces FT, why
 * help you post on FT).
 */

import { useState } from 'react';

interface Props {
  shareUrl: string | null;
  canSave: boolean;
  onSave: (name: string) => void;
}

export function ActionRow({ shareUrl, canSave, onSave }: Props): React.ReactElement {
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  function copyShareUrl(): void {
    if (!shareUrl) return;
    const full = `${window.location.origin}${shareUrl}`;
    void navigator.clipboard.writeText(full).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1200);
    });
  }

  function commitSave(): void {
    if (saveName.trim().length === 0) return;
    onSave(saveName.trim());
    setSaving(false);
    setSaveName('');
  }

  return (
    <div className="action-row">
      {saving ? (
        <div className="action-save">
          <input
            type="text"
            className="action-save-input"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="Routing name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSave();
              if (e.key === 'Escape') {
                setSaving(false);
                setSaveName('');
              }
            }}
          />
          <button type="button" className="action-button primary" onClick={commitSave}>
            Save
          </button>
          <button
            type="button"
            className="action-button"
            onClick={() => {
              setSaving(false);
              setSaveName('');
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="action-button"
            onClick={() => setSaving(true)}
            disabled={!canSave}
            aria-label="Save routing to local list"
          >
            Save
          </button>
          <button
            type="button"
            className="action-button"
            onClick={copyShareUrl}
            disabled={!shareUrl}
            aria-label="Copy share URL to clipboard"
          >
            {shareCopied ? 'Copied ✓' : 'Share URL'}
          </button>
        </>
      )}
    </div>
  );
}
