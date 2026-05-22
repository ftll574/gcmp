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
import type { Valuations } from '../lib/schemas/valuations.ts';
import { Glossary } from './Glossary.tsx';
import { groupColor } from '../lib/group-colors.ts';
import { PROGRAM_LABELS } from '../lib/types.ts';

interface Props {
  result: RoutingResult | null;
  programOrder: ReadonlyArray<ProgramId>;
  mode?: 'beginner' | 'pro';
  cabin: CabinId;
  /** Per-program ¢/mile valuations (null if file unavailable). */
  valuations?: Valuations | null;
  /**
   * Pre-computed result against ALL programs in PROGRAM_REGISTRY — drives
   * the "Where to credit?" inverse view that ranks every program for the
   * current routing, not just the user-selected subset. (wheretocredit.com
   * pattern.) Optional; when omitted the inverse panel is hidden.
   */
  allProgramsResult?: RoutingResult | null;
  /** Add a program to the user's selection (clicked from inverse view). */
  onAddProgram?: (programId: ProgramId) => void;
}

function formatNm(value: number): string {
  return Math.round(value).toLocaleString();
}

/**
 * Cash equivalent in USD, formatted as $X or $X,XXX.
 * cents-per-mile × miles ÷ 100 = dollars.
 */
function cashEquivalent(miles: number, centsPerMile: number): string {
  const usd = (miles * centsPerMile) / 100;
  if (usd >= 1000) return `$${Math.round(usd).toLocaleString()}`;
  if (usd >= 100) return `$${Math.round(usd)}`;
  return `$${usd.toFixed(0)}`;
}

export function EarningPanel({
  result,
  programOrder,
  mode = 'beginner',
  cabin,
  valuations,
  allProgramsResult,
  onAddProgram,
}: Props): React.ReactElement {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const [showWhereToCredit, setShowWhereToCredit] = useState(false);

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

  // Sort programs by **value-weighted miles** when valuations are loaded:
  //   sortKey = rdm × ¢/mile = cash-equivalent in cents
  // This is the Marcus-persona unlock: 8K AA at 1.6¢ ($128) beats
  // 12K DL at 1.2¢ ($144 — only marginally; sometimes it flips).
  // Falls back to raw RDM when no valuation exists for a program.
  const sortKey = (id: ProgramId): number => {
    const rdm = result.grandTotals[id]?.rdm ?? -1;
    if (rdm < 0) return -1;
    const cpm = valuations?.valuations[id];
    return cpm !== undefined ? rdm * cpm : rdm;
  };
  const sortedPrograms = [...programOrder].sort((a, b) => sortKey(b) - sortKey(a));
  const topProgramId = sortedPrograms.find((id) => (result.grandTotals[id]?.rdm ?? 0) > 0);
  const topRdm = topProgramId ? result.grandTotals[topProgramId]?.rdm ?? 0 : 0;

  return (
    <div className="earning-panel">
      {topProgramId && topRdm > 0 && programOrder.length > 1 && (() => {
        const topCpm = valuations?.valuations[topProgramId];
        return (
          <BestRecommendation
            programId={topProgramId}
            rdm={topRdm}
            runnerUpRdm={
              sortedPrograms
                .filter((id) => id !== topProgramId)
                .map((id) => result.grandTotals[id]?.rdm ?? 0)
                .find((r) => r > 0) ?? 0
            }
            {...(topCpm !== undefined ? { valuationCpm: topCpm } : {})}
          />
        );
      })()}
      {mode === 'beginner' && (
        <p className="earning-panel-comparison">
          {multiGroup ? t('groups.compareHint') : t('panel.comparisonBeginner')}
        </p>
      )}
      {sortedPrograms.map((programId) => {
        const cpm = valuations?.valuations[programId];
        return (
          <GrandTotalSection
            key={programId}
            programId={programId}
            result={result}
            cabin={cabin}
            mode={mode}
            showGroupBreakdown={multiGroup}
            isTop={programId === topProgramId && programOrder.length > 1}
            {...(cpm !== undefined ? { valuationCpm: cpm } : {})}
            {...(valuations ? { valuationsSource: valuations } : {})}
          />
        );
      })}
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
      {allProgramsResult && (
        <section className="earning-where-to-credit-section">
          <button
            type="button"
            className="earning-toggle"
            onClick={() => setShowWhereToCredit((x) => !x)}
            aria-expanded={showWhereToCredit}
          >
            {showWhereToCredit ? '▾' : '▸'} {t('whereToCredit.toggle')}
          </button>
          {showWhereToCredit && (
            <WhereToCredit
              result={allProgramsResult}
              selectedIds={new Set(programOrder)}
              valuations={valuations ?? null}
              onAddProgram={onAddProgram}
            />
          )}
        </section>
      )}
      <section className="earning-per-leg-section">
        <button
          type="button"
          className="earning-toggle"
          onClick={() => setExpanded((x) => !x)}
          aria-expanded={expanded}
        >
          {expanded ? '▾' : '▸'} {t('panel.perLegToggle')}
        </button>
        {expanded && <PerLegTables result={result} programOrder={sortedPrograms} />}
      </section>
    </div>
  );
}

interface WhereToCreditProps {
  result: RoutingResult;
  selectedIds: ReadonlySet<ProgramId>;
  valuations: Valuations | null;
  onAddProgram?: ((programId: ProgramId) => void) | undefined;
}

/**
 * Inverse-view ranked table of every program in the registry for the
 * current routing. Inspired by wheretocredit.com's killer feature.
 * Sorted by miles × ¢/mile (value-weighted) when valuations are
 * available; raw RDM otherwise.
 */
function WhereToCredit({
  result,
  selectedIds,
  valuations,
  onAddProgram,
}: WhereToCreditProps): React.ReactElement {
  const { t } = useLocale();
  const rows = Object.keys(result.grandTotals)
    .map((id) => {
      const total = result.grandTotals[id];
      const rdm = total?.rdm ?? 0;
      const cpm = valuations?.valuations[id];
      const usd = cpm !== undefined ? (rdm * cpm) / 100 : null;
      return {
        id,
        label: PROGRAM_LABELS[id] ?? id,
        rdm,
        pqm: total?.pqm ?? 0,
        cpm,
        usd,
        sortKey: cpm !== undefined ? rdm * cpm : rdm,
      };
    })
    .filter((r) => r.rdm > 0)
    .sort((a, b) => b.sortKey - a.sortKey);

  if (rows.length === 0) {
    return (
      <p className="where-to-credit-empty">{t('whereToCredit.empty')}</p>
    );
  }

  return (
    <div className="where-to-credit">
      <p className="where-to-credit-hint">{t('whereToCredit.hint')}</p>
      <ol className="where-to-credit-list">
        {rows.map((row, i) => {
          const selected = selectedIds.has(row.id);
          const canAdd = !selected && onAddProgram !== undefined;
          return (
            <li
              key={row.id}
              className={`where-to-credit-row${selected ? ' selected' : ''}`}
            >
              <span className="where-to-credit-rank">{i + 1}</span>
              <span className="where-to-credit-program">{row.label}</span>
              <span className="where-to-credit-miles">{row.rdm.toLocaleString()}</span>
              {row.usd !== null && (
                <span className="where-to-credit-cash">
                  ${row.usd < 1000 ? Math.round(row.usd) : Math.round(row.usd).toLocaleString()}
                </span>
              )}
              {canAdd && (
                <button
                  type="button"
                  className="where-to-credit-add"
                  onClick={() => onAddProgram?.(row.id)}
                  aria-label={t('whereToCredit.addLabel', { program: row.label })}
                >
                  +
                </button>
              )}
              {selected && (
                <span className="where-to-credit-selected-tick" aria-label="Selected">
                  ✓
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface BestRecommendationProps {
  programId: ProgramId;
  rdm: number;
  runnerUpRdm: number;
  valuationCpm?: number;
}

function BestRecommendation({ programId, rdm, runnerUpRdm, valuationCpm }: BestRecommendationProps): React.ReactElement {
  const { t } = useLocale();
  const label = PROGRAM_LABELS[programId] ?? programId;
  const delta = rdm - runnerUpRdm;
  const showDelta = runnerUpRdm > 0 && delta > 0;
  const pct = showDelta ? Math.round((delta / runnerUpRdm) * 100) : 0;
  return (
    <section className="earning-best" aria-label={t('best.label')}>
      <div className="earning-best-badge">{t('best.badge')}</div>
      <div className="earning-best-program">{t('best.creditTo', { program: label })}</div>
      {showDelta && (
        <div className="earning-best-delta">
          {t('best.delta', { count: delta.toLocaleString(), pct: String(pct) })}
          {valuationCpm !== undefined && (
            <>
              {' · '}
              {t('best.cashEquivalent', { value: cashEquivalent(rdm, valuationCpm) })}
            </>
          )}
        </div>
      )}
    </section>
  );
}

interface GrandTotalProps {
  programId: ProgramId;
  result: RoutingResult;
  cabin: CabinId;
  mode: 'beginner' | 'pro';
  showGroupBreakdown: boolean;
  isTop?: boolean;
  /** ¢/mile valuation for this program. Undefined → chip hidden. */
  valuationCpm?: number;
  /** Same Valuations object for source attribution. */
  valuationsSource?: Valuations | null;
}

function GrandTotalSection({
  programId,
  result,
  cabin,
  mode,
  showGroupBreakdown,
  isTop = false,
  valuationCpm,
  valuationsSource,
}: GrandTotalProps): React.ReactElement {
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

  // Pull provenance from any group's earning entry — they share the same
  // rules version/source within a single computation.
  const firstWithProvenance = result.groups
    .map((g) => g.programs[programId])
    .find((e): e is ProgramEarning => e !== undefined && e.sourceUrl !== '');
  const provenance = firstWithProvenance
    ? {
        version: firstWithProvenance.rulesVersion,
        lastVerified: firstWithProvenance.lastVerified,
        sourceUrl: firstWithProvenance.sourceUrl,
      }
    : null;

  if (!grand) return <></> as React.ReactElement;

  const pqmLabel = mode === 'beginner' ? t('panel.pqmLong') : t('panel.pqmShort');
  const rdmLabel = mode === 'beginner' ? t('panel.rdmLong') : t('panel.rdmShort');

  return (
    <section className={`earning-program${isTop ? ' earning-program-top' : ''}`}>
      <h3 className="earning-program-label">
        {label}
        <ConfidenceChip confidence={confidence} />
        {isTop && <span className="earning-program-best-pill">{t('best.pill')}</span>}
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
        {valuationCpm !== undefined && (
          <div className="earning-cash-equivalent" title={t('cashEq.tip', { source: valuationsSource?.source ?? 'TPG' })}>
            <span className="earning-cash-value">{cashEquivalent(grand.rdm, valuationCpm)}</span>
            <span className="earning-cash-rate">
              {t('cashEq.atRate', { rate: valuationCpm.toFixed(2) })}
            </span>
          </div>
        )}
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
      <div className="earning-program-actions">
        {(() => {
          // Build seats.aero deeplink. The site accepts /search?origin=XXX&destination=YYY&cabin=BUSINESS
          // We use the first leg as the search anchor; multi-leg trips are typically searched as
          // separate segments on award sites.
          const firstGroup = result.groups[0];
          const firstLeg = firstGroup?.byLeg[0];
          if (!firstGroup || !firstLeg) return null;
          const lastLegInGroup = firstGroup.byLeg[firstGroup.byLeg.length - 1];
          const origin = firstLeg.leg.from;
          const destination = lastLegInGroup?.leg.to ?? firstLeg.leg.to;
          const cabinParam = cabin === 'first'
            ? 'FIRST'
            : cabin === 'business'
              ? 'BUSINESS'
              : cabin === 'premium-economy'
                ? 'PREMIUM'
                : 'ECONOMY';
          const href = `https://seats.aero/search?origin=${origin}&destination=${destination}&cabin=${cabinParam}`;
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="earning-program-seats-link"
              title={t('seats.tip')}
            >
              {t('seats.findAwards')} ↗
            </a>
          );
        })()}
      </div>
      {provenance && (
        <footer className="earning-program-provenance">
          {t('provenance.line', {
            version: provenance.version,
            date: provenance.lastVerified,
          })}
          {' · '}
          <a
            href={provenance.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="earning-program-source-link"
          >
            {t('provenance.source')}
          </a>
        </footer>
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
