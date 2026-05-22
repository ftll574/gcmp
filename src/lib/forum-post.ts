/**
 * Plain-text "Copy as forum post" exporter.
 *
 * Produces a monospace-formatted text block paste-friendly for FlyerTalk,
 * 飞客茶馆 (flyertea.com), 批踢踢 (PTT) points board, and similar BBS-style
 * communities where users post routings as ASCII tables rather than
 * screenshots.
 *
 * Format:
 *
 *   gcmp · SFO → NRT → BKK · Business · Rules 2026.4
 *
 *   LEG       OP  FC  DIST       AA AAdvantage    Alaska MP
 *   SFO→NRT   AA  J     4,470          5,587         5,587
 *   NRT→BKK   JL  D     2,962          3,703         3,703
 *   ────────────────────────────────────────────────────────
 *   TOTAL              7,432          9,290         9,290 nm
 *
 *   https://gcmp.app/r/v1/SFO-NRT-BKK?op=AA,JL&p=AA,AS&c=J&fc=J,D
 *
 * Engine purity: no DOM, no React. Pure function for snapshot-testability.
 */

import type {
  CabinId,
  Leg,
  ProgramId,
  RoutingRequest,
  RoutingResult,
} from './types.ts';
import { PROGRAM_LABELS } from './types.ts';

interface FormatInput {
  readonly request: RoutingRequest;
  readonly result: RoutingResult;
  /** Full URL (including scheme + host) to put at the bottom for sharing. */
  readonly shareUrl: string;
}

const CABIN_DISPLAY: Record<CabinId, string> = {
  economy: 'Economy',
  'premium-economy': 'Premium Economy',
  business: 'Business',
  first: 'First',
};

function chainOf(legs: ReadonlyArray<Leg>): string {
  if (legs.length === 0) return '';
  const codes = [legs[0]?.from, ...legs.map((l) => l.to)].filter(
    (s): s is string => typeof s === 'string',
  );
  return codes.join(' → ');
}

function padR(s: string, w: number): string {
  if (s.length >= w) return s;
  return s + ' '.repeat(w - s.length);
}
function padL(s: string, w: number): string {
  if (s.length >= w) return s;
  return ' '.repeat(w - s.length) + s;
}

function fmtN(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Build a single plain-text block for one routing group.
 * Multi-group routings produce multiple blocks separated by blank lines.
 */
function formatGroup(
  groupIdx: number,
  legs: ReadonlyArray<Leg>,
  result: RoutingResult,
  programOrder: ReadonlyArray<ProgramId>,
  multiGroup: boolean,
): string {
  const group = result.groups[groupIdx];
  if (!group) return '';

  // Column widths.
  const ROUTE_W = Math.max(
    8,
    ...legs.map((l) => `${l.from}→${l.to}`.length),
  );
  const OP_W = 3;
  const FC_W = 2;
  const DIST_W = Math.max(
    6,
    ...group.byLeg.map((ld) => fmtN(ld.distanceNm).length),
  );

  // Per-program column widths: max of label, totals, per-leg numbers.
  const progWidths = programOrder.map((id) => {
    const label = (PROGRAM_LABELS[id] ?? id).split(' ')[0] ?? id;
    const totalWidth = fmtN(result.grandTotals[id]?.rdm ?? 0).length;
    const legWidths = group.byLeg.map((_, i) => {
      const e = group.programs[id]?.byLeg[i];
      return e && !e.missingRule ? fmtN(e.rdm).length : 1;
    });
    return Math.max(label.length, totalWidth, ...legWidths, 4);
  });

  const headerRow =
    padR('LEG', ROUTE_W) +
    '  ' +
    padR('OP', OP_W) +
    '  ' +
    padR('FC', FC_W) +
    '  ' +
    padL('DIST', DIST_W) +
    programOrder
      .map((id, i) => {
        const label = (PROGRAM_LABELS[id] ?? id).split(' ')[0] ?? id;
        return '  ' + padL(label, progWidths[i] ?? 4);
      })
      .join('');

  const dataRows = group.byLeg.map((ld, i) => {
    const leg = legs[i];
    if (!leg) return '';
    return (
      padR(`${ld.leg.from}→${ld.leg.to}`, ROUTE_W) +
      '  ' +
      padR(ld.leg.operatingCarrier, OP_W) +
      '  ' +
      padR(leg.fareClass ?? '—', FC_W) +
      '  ' +
      padL(fmtN(ld.distanceNm), DIST_W) +
      programOrder
        .map((id, pi) => {
          const e = group.programs[id]?.byLeg[i];
          const val = e && !e.missingRule ? fmtN(e.rdm) : '—';
          return '  ' + padL(val, progWidths[pi] ?? 4);
        })
        .join('')
    );
  });

  const totalsRow =
    padR('TOTAL', ROUTE_W + 2 + OP_W + 2 + FC_W) +
    '  ' +
    padL(fmtN(group.totalDistanceNm), DIST_W) +
    programOrder
      .map((id, pi) => {
        const e = group.programs[id];
        const val = e ? fmtN(e.rdm) : '—';
        return '  ' + padL(val, progWidths[pi] ?? 4);
      })
      .join('');

  const ruleWidth = headerRow.length;
  const rule = '─'.repeat(ruleWidth);

  const header = multiGroup ? `Routing ${groupIdx + 1}: ${chainOf(legs)}\n\n` : '';
  return header + [headerRow, ...dataRows, rule, totalsRow].join('\n');
}

export function formatForumPost(input: FormatInput): string {
  const { request, result, shareUrl } = input;
  const cabinLabel = CABIN_DISPLAY[request.cabin];
  const allChains = request.groups.map((g) => chainOf(g.legs)).filter(Boolean);
  const headerLine =
    `gcmp · ${allChains.join('   /   ')} · ${cabinLabel} · ` +
    `Rules ${result.rulesVersionUsed}`;

  const programOrder = request.programs;
  const multiGroup = request.groups.length > 1;
  const blocks = request.groups.map((g, gi) =>
    formatGroup(gi, g.legs, result, programOrder, multiGroup),
  );

  if (multiGroup) {
    // Grand totals across all groups.
    const grandLabel = padR('GRAND TOTAL', 12);
    const dist = fmtN(result.grandTotalDistanceNm);
    const programs = programOrder
      .map((id) => {
        const t = result.grandTotals[id];
        return `${(PROGRAM_LABELS[id] ?? id).split(' ')[0]}: ${t ? fmtN(t.rdm) : '—'}`;
      })
      .join('   ');
    blocks.push(`${grandLabel} ${dist} nm   ${programs}`);
  }

  return [
    headerLine,
    '',
    blocks.join('\n\n'),
    '',
    shareUrl,
  ].join('\n');
}
