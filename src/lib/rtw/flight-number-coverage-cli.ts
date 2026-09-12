import { isCalendarDate } from '../calendar-date.ts';

export interface FlightNumberCoverageCliOptions {
  readonly asOf: string;
  readonly summaryOnly: boolean;
}

export function parseFlightNumberCoverageArgs(
  args: ReadonlyArray<string>,
  utcToday = new Date().toISOString().slice(0, 10),
): FlightNumberCoverageCliOptions {
  let asOf: string | undefined;
  let summaryOnly = false;

  for (const arg of args) {
    if (arg === '--summary') {
      summaryOnly = true;
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown flag: ${arg}`);
    if (asOf !== undefined) throw new Error(`Unexpected argument: ${arg}`);
    asOf = arg;
  }

  const resolvedAsOf = asOf ?? utcToday;
  if (!isCalendarDate(resolvedAsOf)) throw new Error(`Invalid asOf date: ${resolvedAsOf}`);
  return { asOf: resolvedAsOf, summaryOnly };
}
