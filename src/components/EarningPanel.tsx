/**
 * The right-side earning panel. PQM/RDM per program is the visual hero
 * (Premise 1: the calculation IS the product, not the map).
 *
 * In beginner mode:
 *   - Empty hint is a sentence in the user's language
 *   - "Status Miles" / "Award Miles" full names instead of PQM/RDM
 *   - Glossary tooltips on jargon
 *   - Plain-language summary above the numbers
 *
 * In pro mode:
 *   - PQM / RDM mono shorthand
 *   - No tooltips, no decorative summary
 */

import { useState } from 'react';
import { useLocale } from '../i18n/use-locale.ts';
import type { CabinId, ProgramEarning, ProgramId, RoutingResult } from '../lib/types.ts';
import { Glossary } from './Glossary.tsx';

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

  if (!result || result.byLeg.length === 0) {
    return (
      <div className="earning-panel earning-panel-empty">
        <p className="earning-panel-hint">
          {mode === 'beginner' ? t('panel.emptyHintBeginner') : t('panel.emptyHint')}
        </p>
      </div>
    );
  }

  return (
    <div className="earning-panel">
      {mode === 'beginner' && (
        <p className="earning-panel-comparison">
          {t('panel.comparisonBeginner')}
        </p>
      )}
      {programOrder.map((programId) => {
        const earning = result.programs[programId];
        if (!earning) return null;
        return <ProgramSection key={programId} earning={earning} mode={mode} cabin={cabin} />;
      })}
      <section className="earning-totals" aria-label={t('panel.totalDistance')}>
        <div className="earning-totals-row">
          <span className="earning-totals-label">{t('panel.totalDistance')}</span>
          <span className="earning-totals-value">
            {formatNm(result.totalDistanceNm)} {t('panel.milesUnit')}
          </span>
        </div>
        {result.warnings.length > 0 && (
          <ul className="earning-warnings" aria-label={t('panel.warningsLabel')}>
            {result.warnings.map((w, i) => (
              <li key={i} className="earning-warning">⚠ {w}</li>
            ))}
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
        {expanded && <PerLegTable result={result} programOrder={programOrder} />}
      </section>
    </div>
  );
}

interface ProgramSectionProps {
  earning: ProgramEarning;
  mode: 'beginner' | 'pro';
  cabin: CabinId;
}

function ProgramSection({ earning, mode, cabin }: ProgramSectionProps): React.ReactElement {
  const { t } = useLocale();
  const pqmLabel = mode === 'beginner' ? t('panel.pqmLong') : t('panel.pqmShort');
  const rdmLabel = mode === 'beginner' ? t('panel.rdmLong') : t('panel.rdmShort');
  const cabinName = t(`cabin.${cabin === 'premium-economy' ? 'premiumEconomy' : cabin}`);

  return (
    <section className="earning-program" aria-label={earning.label}>
      <h3 className="earning-program-label">
        {earning.label}
        <ConfidenceChip confidence={earning.confidence} />
      </h3>
      {mode === 'beginner' && (
        <p className="earning-program-summary">
          {t('panel.summaryBeginner', { carrier: earning.label, cabin: cabinName })}
        </p>
      )}
      <div className="earning-numbers">
        <div className="earning-number-row">
          <span className="earning-number-value">{earning.pqm.toLocaleString()}</span>
          <span className="earning-number-unit">
            {mode === 'beginner' ? (
              <Glossary term="pqm">{pqmLabel}</Glossary>
            ) : (
              pqmLabel
            )}
          </span>
        </div>
        <div className="earning-number-row earning-number-secondary">
          <span className="earning-number-value">{earning.rdm.toLocaleString()}</span>
          <span className="earning-number-unit">
            {mode === 'beginner' ? (
              <Glossary term="rdm">{rdmLabel}</Glossary>
            ) : (
              rdmLabel
            )}
          </span>
        </div>
      </div>
      {earning.notes.length > 0 && (
        <ul className="earning-program-notes">
          {earning.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
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

function PerLegTable({
  result,
  programOrder,
}: {
  result: RoutingResult;
  programOrder: ReadonlyArray<ProgramId>;
}): React.ReactElement {
  const { t } = useLocale();
  return (
    <table className="per-leg-table">
      <thead>
        <tr>
          <th>{t('table.leg')}</th>
          <th>{t('table.distance')}</th>
          {programOrder.map((id) => {
            const e = result.programs[id];
            return <th key={id}>{e?.label.split(' ')[0] ?? id}</th>;
          })}
        </tr>
      </thead>
      <tbody>
        {result.byLeg.map((ld, i) => (
          <tr key={i}>
            <td className="per-leg-route">
              {ld.leg.from} → {ld.leg.to}
              <span className="per-leg-carrier"> on {ld.leg.operatingCarrier}</span>
            </td>
            <td className="per-leg-distance">{Math.round(ld.distanceNm).toLocaleString()} {t('panel.milesUnit')}</td>
            {programOrder.map((id) => {
              const e = result.programs[id];
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
  );
}
