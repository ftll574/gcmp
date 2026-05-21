/**
 * Save / Share URL action row. "Copy as FlyerTalk post" was cut per
 * eng review OV7.
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';

interface Props {
  shareUrl: string | null;
  canSave: boolean;
  onSave: (name: string) => void;
}

export function ActionRow({ shareUrl, canSave, onSave }: Props): React.ReactElement {
  const { t } = useLocale();
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  function copyShareUrl(): void {
    if (!shareUrl) return;
    const full = `${window.location.origin}${window.location.pathname}${shareUrl}`;
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
            placeholder={t('save.promptName')}
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
            {t('save.save')}
          </button>
          <button
            type="button"
            className="action-button"
            onClick={() => {
              setSaving(false);
              setSaveName('');
            }}
          >
            {t('save.cancel')}
          </button>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="action-button"
            onClick={() => setSaving(true)}
            disabled={!canSave}
          >
            {t('header.save')}
          </button>
          <button
            type="button"
            className="action-button"
            onClick={copyShareUrl}
            disabled={!shareUrl}
          >
            {shareCopied ? t('header.copied') : t('header.shareUrl')}
          </button>
        </>
      )}
    </div>
  );
}
