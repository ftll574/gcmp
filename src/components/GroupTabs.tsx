/**
 * Group tab strip — show all routing groups, switch between them for
 * editing, add/remove groups.
 *
 *   [ Routing 1 ]  [ Routing 2 ] [ Routing 3 ]  [ + Add routing ]
 *
 * Each tab shows the group's "chain summary" (first → last IATA). Color
 * dot matches the color the map will use for that group's arcs.
 */

import { useLocale } from '../i18n/use-locale.ts';
import { groupColor } from '../lib/group-colors.ts';
import type { RoutingGroup } from '../lib/types.ts';

interface Props {
  groups: ReadonlyArray<RoutingGroup>;
  activeIndex: number;
  onActivate: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

function summary(group: RoutingGroup): string {
  if (group.legs.length === 0) return '—';
  const first = group.legs[0]?.from ?? '?';
  const last = group.legs[group.legs.length - 1]?.to ?? '?';
  return `${first} → ${last}`;
}

export function GroupTabs({ groups, activeIndex, onActivate, onAdd, onRemove }: Props): React.ReactElement | null {
  const { t } = useLocale();
  // Don't render the strip when there's only one group AND it's empty —
  // the chain widget alone is sufficient. Show the strip as soon as a
  // user creates a 2nd group or has data.
  if (groups.length === 1 && groups[0]?.legs.length === 0) {
    return (
      <div className="group-tabs">
        <button type="button" className="group-tab-add" onClick={onAdd}>
          {t('groups.addGroup')}
        </button>
      </div>
    );
  }
  return (
    <div className="group-tabs" role="tablist" aria-label={t('groups.label')}>
      {groups.map((g, i) => {
        const active = i === activeIndex;
        return (
          <div key={i} className={`group-tab${active ? ' active' : ''}`}>
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className="group-tab-main"
              onClick={() => onActivate(i)}
            >
              <span className="group-tab-color" style={{ background: groupColor(i) }} aria-hidden="true" />
              <span className="group-tab-label">{t('groups.groupN', { n: i + 1 })}</span>
              <span className="group-tab-summary">{summary(g)}</span>
            </button>
            {groups.length > 1 && (
              <button
                type="button"
                className="group-tab-remove"
                aria-label={t('groups.removeGroup', { n: i + 1 })}
                onClick={() => onRemove(i)}
              >
                ×
              </button>
            )}
          </div>
        );
      })}
      <button type="button" className="group-tab-add" onClick={onAdd}>
        {t('groups.addGroup')}
      </button>
    </div>
  );
}
