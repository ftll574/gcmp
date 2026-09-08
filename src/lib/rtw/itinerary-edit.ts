import type { AirlineIata, FlightLeg, Leg } from '../types.ts';

type FlightOptionalLegField = 'fareClass' | 'cabin' | 'departsOn' | 'flightNumber' | 'manual';

/** Remove only the requested field. Preserve all other metadata, including
 * fields that callers do not know about yet. Never mutate the source leg. */
export function clearLegField(leg: FlightLeg, field: FlightOptionalLegField): FlightLeg;
export function clearLegField(leg: Leg, field: 'stopover'): Leg;
export function clearLegField(leg: Leg, field: FlightOptionalLegField | 'stopover'): Leg {
  if (field === 'stopover') {
    const next = { ...leg };
    delete next.stopover;
    return next;
  }
  if (leg.surface === true) return leg;
  const next = { ...leg };
  if (field === 'fareClass') delete next.fareClass;
  else if (field === 'cabin') delete next.cabin;
  else if (field === 'departsOn') delete next.departsOn;
  else if (field === 'flightNumber') delete next.flightNumber;
  else if (field === 'manual') delete next.manual;
  return next;
}

/**
 * Airport occurrence indexes, NOT airport codes, carry identity through edits:
 * old airports [0:A, 1:B, 2:A, 3:B, 4:C] → keep [2,3,4]
 * preserves the SECOND A→B leg, with its own date/carrier, then B→C.
 *
 * A leg is reused only if its two original adjacent occurrences remain
 * adjacent in the same direction. New connections get fresh metadata.
 */
export function reindexLegs(
  existing: ReadonlyArray<Leg>,
  airportOrder: ReadonlyArray<number>,
  defaultCarrier: AirlineIata,
): Leg[] {
  if (existing.length === 0) return [];
  if (
    new Set(airportOrder).size !== airportOrder.length ||
    airportOrder.some((index) => !Number.isInteger(index) || index < 0 || index > existing.length)
  ) {
    throw new RangeError('Airport order must contain unique, in-range occurrence indexes.');
  }
  const codes = [existing[0]!.from, ...existing.map((leg) => leg.to)];
  const result: Leg[] = [];
  for (let i = 0; i < airportOrder.length - 1; i++) {
    const fromIndex = airportOrder[i]!;
    const toIndex = airportOrder[i + 1]!;
    const previous = existing[fromIndex];
    if (previous !== undefined && toIndex === fromIndex + 1) {
      result.push(previous);
    } else {
      result.push({ from: codes[fromIndex]!, to: codes[toIndex]!, operatingCarrier: defaultCarrier });
    }
  }
  return result;
}
