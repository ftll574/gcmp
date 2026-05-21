/**
 * Earning panel. v0.4: shows grand totals across all groups + per-group
 * breakdown when there are 2+ groups.
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import type {
  CabinId,
  GroupResult,
  ProgramEarning,
  ProgramId,
  RoutingResult,
} from '../lib/types.ts';
import { Glossary } from './Glossary.tsx';
import { groupColor } from '../lib/group-colors.ts';
import { PROGRAM_LABELS } from '../lib/types.ts';

interface Props {
  result: RoutingResult | null;
  programOrder: ReadonlyArray<ProgramId>;
  mode?: 'beginner' | 'pro';
  cabin: CabinId;
}

function formatNm(value: number): string {
  return Math.round(value).toLocaleString();
}

export function EarningPanel({ result, programOrder, mode = 'beginner', cabin }: Props): React.ReactElement {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);

  if (!result || result.groups.every((g) => g.byLeg.length === 0)) {
    return (
      <div className="earning-panel earning-panel-empty">
        <p className="earning-panel-hint">
          {mode === 'beginner' ? t('panel.emptyHintBeginner') : t('panel.emptyHint')}
        </p>
      </div>
    );
  }

  const multiGroup = result.groups.length > 1;

  return (
    <div className="earning-panel">
      {mode === 'beginner' && (
        <p className="earning-panel-comparison">
          {multiGroup ? t('groups.compareHint') : t('panel.comparisonBeginner')}
        </p>
      )}
      {programOrder.map((programId) => (
        <GrandTotalSection
          key={programId}
          programId={programId}
          result={result}
          cabin={cabin}
          mode={mode}
          showGroupBreakdown={multiGroup}
        />
      ))}
      <section className="earning-totals" aria-label={t('panel.totalDistance')}>
        <div className="earning-totals-row">
          <span className="earning-totals-label">{t('panel.totalDistance')}</span>
          <span className="earning-totals-value">
            {formatNm(result.grandTotalDistanceNm)} {t('panel.milesUnit')}
          </span>
        </div>
        {result.groups.some((g) => g.warnings.length > 0) && (
          <ul className="earning-warnings" aria-label={t('panel.warningsLabel')}>
            {result.groups.flatMap((g, gi) =>
              g.warnings.map((w, wi) => (
                <li key={`${gi}-${wi}`} className="earning-warning">
                  ⚠ {w}
                </li>
              )),
            )}
          </ul>
        )}
      </section>
      <section className="earning-per-leg-section">
        <button
          type="button"
          className="earning-toggle"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'} {t('panel.perLegToggle')}
        </button>
        {expanded && <PerLegTables result={result} programOrder={programOrder} />}
      </section>
    </div>
  );
}

interface GrandTotalProps {
  programId: ProgramId;
  result: RoutingResult;
  cabin: CabinId;
  mode: 'beginner' | 'pro';
  showGroupBreakdown: boolean;
}

function GrandTotalSection({ programId, result, cabin, mode, showGroupBreakdown }: GrandTotalProps): React.ReactElement {
  const { t } = useLocale();
  const grand = result.grandTotals[programId];
  const label = PROGRAM_LABELS[programId] ?? programId;
  const cabinName = t(`cabin.${cabin === 'premium-economy' ? 'premiumEconomy' : cabin}`);
  // Confidence: use the first non-mixed across groups; if any are mixed → mixed.
  const confidences = result.groups
    .map((g) => g.programs[programId]?.confidence)
    .filter((c): c is ProgramEarning['confidence'] => c !== undefined);
  const hasMixed = confidences.includes('mixed');
  const hasCorrected = confidences.includes('community-corrected');
  const confidence: ProgramEarning['confidence'] = hasMixed
    ? 'mixed'
    : hasCorrected && confidences.includes('chart-verified')
      ? 'mixed'
      : (confidences[0] ?? 'chart-verified');

  if (!grand) return <></> as React.ReactElement;

  const pqmLabel = mode === 'beginner' ? t('panel.pqmLong') : t('panel.pqmShort');
  const rdmLabel = mode === 'beginner' ? t('panel.rdmLong') : t('panel.rdmShort');

  return (
    <section className="earning-program">
      <h3 className="earning-program-label">
        {label}
        <ConfidenceChip confidence={confidence} />
      </h3>
      {mode === 'beginner' && (
        <p className="earning-program-summary">
          {t('panel.summaryBeginner', { carrier: label, cabin: cabinName })}
        </p>
      )}
      <div className="earning-numbers">
        <div className="earning-number-row">
          <span className="earning-number-value">{grand.pqm.toLocaleString()}</span>
          <span className="earning-number-unit">
            {mode === 'beginner' ? <Glossary term="pqm">{pqmLabel}</Glossary> : pqmLabel}
          </span>
        </div>
        <div className="earning-number-row earning-number-secondary">
          <span className="earning-number-value">{grand.rdm.toLocaleString()}</span>
          <span className="earning-number-unit">
            {mode === 'beginner' ? <Glossary term="rdm">{rdmLabel}</Glossary> : rdmLabel}
          </span>
        </div>
      </div>
      {showGroupBreakdown && (
        <table className="earning-group-breakdown">
          <thead>
            <tr>
              <th></th>
              <th>{pqmLabel}</th>
              <th>{rdmLabel}</th>
            </tr>
          </thead>
          <tbody>
            {result.groups.map((g, gi) => {
              const e = g.programs[programId];
              return (
                <tr key={gi}>
                  <td>
                    <span
                      className="group-tab-color"
                      style={{ background: groupColor(gi) }}
                      aria-hidden="true"
                    />{' '}
                    {t('groups.groupN', { n: gi + 1 })}
                  </td>
                  <td>{e?.pqm.toLocaleString() ?? '—'}</td>
                  <td>{e?.rdm.toLocaleString() ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function ConfidenceChip({ confidence }: { confidence: ProgramEarning['confidence'] }): React.ReactElement {
  const { t } = useLocale();
  if (confidence === 'mixed') {
    return (
      <span className="confidence-chip confidence-mixed" title={t('panel.confidenceMixedTip')}>
        {t('panel.confidenceMixed')}
      </span>
    );
  }
  if (confidence === 'community-corrected') {
    return (
      <span className="confidence-chip confidence-corrected" title={t('panel.confidenceCorrectedTip')}>
        {t('panel.confidenceCorrected')}
      </span>
    );
  }
  return (
    <span className="confidence-chip confidence-chart" title={t('panel.confidenceChartTip')}>
      {t('panel.confidenceChart')}
    </span>
  );
}

function PerLegTables({
  result,
  programOrder,
}: {
  result: RoutingResult;
  programOrder: ReadonlyArray<ProgramId>;
}): React.ReactElement {
  return (
    <>
      {result.groups.map((g, gi) => (
        <PerLegTable key={gi} group={g} groupIndex={gi} programOrder={programOrder} multiGroup={result.groups.length > 1} />
      ))}
    </>
  );
}

function PerLegTable({
  group,
  groupIndex,
  programOrder,
  multiGroup,
}: {
  group: GroupResult;
  groupIndex: number;
  programOrder: ReadonlyArray<ProgramId>;
  multiGroup: boolean;
}): React.ReactElement {
  const { t } = useLocale();
  return (
    <div className="per-leg-table-wrap">
      {multiGroup && (
        <h4 className="per-leg-group-heading">
          <span className="group-tab-color" style={{ background: groupColor(groupIndex) }} aria-hidden="true" />
          {t('groups.groupN', { n: groupIndex + 1 })}
        </h4>
      )}
      <table className="per-leg-table">
        <thead>
          <tr>
            <th>{t('table.leg')}</th>
            <th>{t('table.distance')}</th>
            {programOrder.map((id) => {
              const e = group.programs[id];
              return <th key={id}>{e?.label.split(' ')[0] ?? id}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {group.byLeg.map((ld, i) => (
            <tr key={i}>
              <td className="per-leg-route">
                {ld.leg.from} → {ld.leg.to}
                <span className="per-leg-carrier"> on {ld.leg.operatingCarrier}</span>
              </td>
              <td className="per-leg-distance">
                {Math.round(ld.distanceNm).toLocaleString()} {t('panel.milesUnit')}
              </td>
              {programOrder.map((id) => {
                const e = group.programs[id];
                const legEarning = e?.byLeg[i];
                if (!legEarning) return <td key={id}>{t('table.missing')}</td>;
                if (legEarning.missingRule) {
                  return (
                    <td key={id} className="per-leg-missing" title={legEarning.notes.join(' ')}>
                      {t('table.missing')}
                    </td>
                  );
                }
                return (
                  <td key={id} className="per-leg-program">
                    {legEarning.pqm.toLocaleString()}
                    {legEarning.notes.length > 0 && (
                      <span className="per-leg-note-marker" title={legEarning.notes.join(' ')}>
                        *
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
