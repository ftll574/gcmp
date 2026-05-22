/**
 * Save / Share URL / Copy text action row.
 *
 * "Copy as forum post" was cut in v0.4 per eng review OV7 but reinstated in
 * v1.5 — every persona researched (US FlyerTalk, Asian flyertea/PTT) posts
 * routings as ASCII tables, not screenshots, so this is the highest-leverage
 * single-button feature.
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import { formatForumPost } from '../lib/forum-post.ts';
import type { RoutingRequest, RoutingResult } from '../lib/types.ts';

interface Props {
  shareUrl: string | null;
  canSave: boolean;
  onSave: (name: string) => void;
  /** Latest computed result, used to format the plain-text post. */
  result: RoutingResult | null;
  /** The same RoutingRequest used to compute `result`. */
  routing: RoutingRequest;
}

export function ActionRow({
  shareUrl,
  canSave,
  onSave,
  result,
  routing,
}: Props): React.ReactElement {
  const { t } = useLocale();
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [shareCopied, setShareCopied] = useState(false);
  const [textCopied, setTextCopied] = useState(false);

  function fullShareUrl(): string | null {
    if (!shareUrl) return null;
    return `${window.location.origin}${window.location.pathname}${shareUrl}`;
  }

  function copyShareUrl(): void {
    const full = fullShareUrl();
    if (!full) return;
    void navigator.clipboard.writeText(full).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1200);
    });
  }

  function copyText(): void {
    const full = fullShareUrl();
    if (!result || !full) return;
    const text = formatForumPost({ request: routing, result, shareUrl: full });
    void navigator.clipboard.writeText(text).then(() => {
      setTextCopied(true);
      setTimeout(() => setTextCopied(false), 1500);
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
          <button
            type="button"
            className="action-button"
            onClick={copyText}
            disabled={!shareUrl || !result}
            title={t('header.copyTextTitle')}
          >
            {textCopied ? t('header.copied') : t('header.copyText')}
          </button>
        </>
      )}
    </div>
  );
}
