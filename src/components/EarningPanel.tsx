/**
 * The right-side earning panel. PQM/RDM per program is the visual hero
 * (Premise 1: the calculation IS the product, not the map).
 *
 *   ─────────
 *   AA AAdvantage
 *     14,200 PQM  (28px monospace)
 *     14,200 RDM
 *     [confidence chip]
 *   ─────────
 *   Alaska Mileage Plan
 *     11,400 PQM
 *     11,400 Miles
 *   ─────────
 *   Total: 13,847 nm
 *   ─────────
 *   ▸ Per-leg breakdown (collapsible)
 *
 * Codeshare-unverified / missing-rule legs surface as amber notes inside
 * the per-leg expansion.
 */

import { useState } from 'react';
import type { ProgramEarning, ProgramId, RoutingResult } from '../lib/types.ts';

interface Props {
  result: RoutingResult | null;
  programOrder: ReadonlyArray<ProgramId>;
}

function formatNm(value: number): string {
  return Math.round(value).toLocaleString();
}

export function EarningPanel({ result, programOrder }: Props): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  if (!result || result.byLeg.length === 0) {
    return (
      <div className="earning-panel earning-panel-empty">
        <p className="earning-panel-hint">Add 2+ airports to see earning.</p>
      </div>
    );
  }

  return (
    <div className="earning-panel">
      {programOrder.map((programId) => {
        const earning = result.programs[programId];
        if (!earning) return null;
        return <ProgramSection key={programId} earning={earning} />;
      })}
      <section className="earning-totals" aria-label="Routing totals">
        <div className="earning-totals-row">
          <span className="earning-totals-label">Total distance</span>
          <span className="earning-totals-value">{formatNm(result.totalDistanceNm)} nm</span>
        </div>
        {result.warnings.length > 0 && (
          <ul className="earning-warnings" aria-label="Warnings">
            {result.warnings.map((w, i) => (
              <li key={i} className="earning-warning">
                ⚠ {w}
              </li>
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
          {expanded ? '▾' : '▸'} Per-leg breakdown
        </button>
        {expanded && <PerLegTable result={result} programOrder={programOrder} />}
      </section>
    </div>
  );
}

function ProgramSection({ earning }: { earning: ProgramEarning }): React.ReactElement {
  return (
    <section className="earning-program" aria-label={earning.label}>
      <h3 className="earning-program-label">
        {earning.label}
        <ConfidenceChip confidence={earning.confidence} />
      </h3>
      <div className="earning-numbers">
        <div className="earning-number-row">
          <span className="earning-number-value">{earning.pqm.toLocaleString()}</span>
          <span className="earning-number-unit">PQM</span>
        </div>
        <div className="earning-number-row earning-number-secondary">
          <span className="earning-number-value">{earning.rdm.toLocaleString()}</span>
          <span className="earning-number-unit">RDM</span>
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

function ConfidenceChip({ confidence }: { confidence: ProgramEarning['confidence'] }): React.ReactElement | null {
  if (confidence === 'mixed') {
    return <span className="confidence-chip confidence-mixed" title="Mix of chart-verified and community-corrected rules across legs.">mixed</span>;
  }
  if (confidence === 'community-corrected') {
    return <span className="confidence-chip confidence-corrected" title="Earning rule corrected against actual statement postings.">corrected</span>;
  }
  return <span className="confidence-chip confidence-chart" title="Verified against the airline's published partner chart. Actual postings may differ.">chart</span>;
}

function PerLegTable({ result, programOrder }: { result: RoutingResult; programOrder: ReadonlyArray<ProgramId> }): React.ReactElement {
  return (
    <table className="per-leg-table">
      <thead>
        <tr>
          <th>Leg</th>
          <th>Distance</th>
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
            <td className="per-leg-distance">{formatNm(ld.distanceNm)} nm</td>
            {programOrder.map((id) => {
              const e = result.programs[id];
              const legEarning = e?.byLeg[i];
              if (!legEarning) return <td key={id}>—</td>;
              if (legEarning.missingRule) {
                return (
                  <td key={id} className="per-leg-missing" title={legEarning.notes.join(' ')}>
                    —
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
