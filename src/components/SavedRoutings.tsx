/**
 * Saved routings sidebar. Reads from localStorage. Loading a saved
 * routing fills the URL state.
 */

interface SavedRouting {
  name: string;
  url: string;
  savedAt: string; // ISO date
}

interface Props {
  saved: ReadonlyArray<SavedRouting>;
  onLoad: (url: string) => void;
  onDelete: (name: string) => void;
}

export function SavedRoutings({ saved, onLoad, onDelete }: Props): React.ReactElement | null {
  if (saved.length === 0) return null;
  return (
    <aside className="saved-routings" aria-label="Saved routings">
      <h4 className="saved-routings-title">Saved</h4>
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
              aria-label={`Delete ${s.name}`}
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
