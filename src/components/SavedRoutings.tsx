import { useLocale } from '../i18n/use-locale.ts';

interface SavedRouting {
  name: string;
  url: string;
  savedAt: string;
}

interface Props {
  saved: ReadonlyArray<SavedRouting>;
  onLoad: (url: string) => void;
  onDelete: (name: string) => void;
}

export function SavedRoutings({ saved, onLoad, onDelete }: Props): React.ReactElement | null {
  const { t } = useLocale();
  if (saved.length === 0) return null;
  return (
    <aside className="saved-routings" aria-label={t('saved.title')}>
      <h4 className="saved-routings-title">{t('saved.title')}</h4>
      <ul className="saved-routings-list">
        {saved.map((s) => (
          <li key={s.name} className="saved-routings-item">
            <button
              type="button"
              className="saved-routings-load"
              onClick={() => onLoad(s.url)}
              title={s.url}
            >
              {s.name}
            </button>
            <button
              type="button"
              className="saved-routings-delete"
              aria-label={t('saved.delete', { name: s.name })}
              onClick={() => onDelete(s.name)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export type { SavedRouting };
