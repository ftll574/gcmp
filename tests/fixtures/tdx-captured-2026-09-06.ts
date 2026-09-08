/** REAL public-field transcription, not synthetic airline service data.
 * Source: account-holder snapshot.json captured 2026-09-05T17:09:57.251Z,
 * TDX GeneralSchedule/International, https://data.gov.tw/dataset/161167.
 * Selected 61 rows / five designators. Every period for each selected
 * designator is retained; other designators are deliberately NOT included.
 * Empty CodeShare and absent operator markers are observed facts. Identical
 * clocks do NOT establish codeshare direction or the operating airline.
 * Historical test-only evidence: never imported into production catalogs.
 * Tuple: validity start, validity end, ISO weekdays, departure, arrival.
 */
type Period = readonly [string, string, readonly number[], string, string];
interface CapturedService {
  from: string; to: string; fetchedAt: string; airlineId: string;
  sourceFlightNumber: string; periods: readonly Period[];
}

export const CAPTURED_AT = '2026-09-05T17:09:57.251Z';
const UPDATE_TIME = '2026-09-06T00:01:53+08:00';
const latePacificPeriods: readonly Period[] = [
  ['2026-09-01', '2026-09-06', [2,3,4,5,6,7], '00:05', '20:30-1'],
  ['2026-09-07', '2026-09-13', [1,2,3,4,5,6,7], '00:05', '20:30-1'],
  ['2026-09-14', '2026-09-20', [1,2,3,4,5,6,7], '00:05', '20:30-1'],
  ['2026-09-21', '2026-09-27', [1,2,3,4,5,6,7], '00:05', '20:30-1'],
  ['2026-09-28', '2026-10-04', [1,2,3,4,5,6,7], '00:05', '20:30-1'],
  ['2026-10-05', '2026-10-11', [1,2,3,4,5,6,7], '00:05', '20:30-1'],
  ['2026-10-12', '2026-10-18', [1,2,3,4,5,6,7], '00:05', '20:30-1'],
  ['2026-10-19', '2026-10-24', [1,2,3,4,5,6], '00:05', '20:30-1'],
];

export const capturedServices: readonly CapturedService[] = [
  { from: 'TPE', to: 'HKG', fetchedAt: '2026-09-05T17:09:56.800Z', airlineId: 'JX', sourceFlightNumber: 'JX233', periods: [
    ['2026-09-06', '2026-09-06', [7], '08:30', '10:10'],
    ['2026-09-07', '2026-09-07', [1], '08:20', '09:55'],
    ['2026-09-08', '2026-09-12', [2,3,5,6], '08:05', '09:55'],
    ['2026-09-10', '2026-09-10', [4], '08:10', '09:55'],
    ['2026-09-13', '2026-09-13', [7], '08:30', '10:10'],
    ['2026-09-14', '2026-09-14', [1], '08:20', '09:55'],
    ['2026-09-15', '2026-09-19', [2,3,5,6], '08:05', '09:55'],
    ['2026-09-17', '2026-09-17', [4], '08:10', '09:55'],
    ['2026-09-20', '2026-09-20', [7], '08:30', '10:10'],
    ['2026-09-21', '2026-09-21', [1], '08:20', '09:55'],
    ['2026-09-22', '2026-09-26', [2,3,5,6], '08:05', '09:55'],
    ['2026-09-24', '2026-09-24', [4], '08:10', '09:55'],
    ['2026-09-27', '2026-09-27', [7], '08:30', '10:10'],
    ['2026-09-28', '2026-09-28', [1], '08:20', '09:55'],
    ['2026-09-29', '2026-10-03', [2,3,5,6], '08:05', '09:55'],
    ['2026-10-01', '2026-10-01', [4], '08:10', '09:55'],
    ['2026-10-04', '2026-10-04', [7], '08:30', '10:10'],
    ['2026-10-05', '2026-10-05', [1], '08:20', '09:55'],
    ['2026-10-06', '2026-10-10', [2,3,5,6], '08:05', '09:55'],
    ['2026-10-08', '2026-10-08', [4], '08:10', '09:55'],
    ['2026-10-11', '2026-10-11', [7], '08:30', '10:10'],
    ['2026-10-12', '2026-10-12', [1], '08:20', '09:55'],
    ['2026-10-13', '2026-10-17', [2,3,5,6], '08:05', '09:55'],
    ['2026-10-15', '2026-10-15', [4], '08:10', '09:55'],
    ['2026-10-18', '2026-10-18', [7], '08:30', '10:10'],
    ['2026-10-19', '2026-10-19', [1], '08:20', '09:55'],
    ['2026-10-20', '2026-10-24', [2,3,5,6], '08:05', '09:55'],
    ['2026-10-22', '2026-10-22', [4], '08:10', '09:55'],
  ] },
  { from: 'HKG', to: 'TPE', fetchedAt: '2026-09-05T17:09:57.034Z', airlineId: 'CX', sourceFlightNumber: 'CX408', periods: [
    ['2026-08-31', '2026-09-06', [1,2,3,4,5,6,7], '22:50', '00:35+1'],
    ['2026-09-07', '2026-09-13', [1,2,3,4,5,6,7], '22:50', '00:35+1'],
    ['2026-09-14', '2026-09-20', [1,2,3,4,5,6,7], '22:50', '00:35+1'],
    ['2026-09-21', '2026-09-27', [1,2,3,4,5,6,7], '22:50', '00:35+1'],
    ['2026-09-28', '2026-10-04', [1,2,3,4,5,6,7], '22:50', '00:35+1'],
    ['2026-10-05', '2026-10-11', [1,2,3,4,5,6,7], '22:50', '00:35+1'],
    ['2026-10-12', '2026-10-18', [1,2,3,4,5,6,7], '22:50', '00:35+1'],
    ['2026-10-19', '2026-10-24', [1,2,3,4,5,6], '22:50', '00:35+1'],
  ] },
  { from: 'TPE', to: 'SFO', fetchedAt: '2026-09-05T17:09:57.209Z', airlineId: 'AS', sourceFlightNumber: 'AS7218', periods: latePacificPeriods },
  { from: 'TPE', to: 'SFO', fetchedAt: '2026-09-05T17:09:57.209Z', airlineId: 'BR', sourceFlightNumber: 'BR008', periods: [
    ['2026-09-01', '2026-09-06', [2,3,4,5,6,7], '10:15', '06:45'],
    ['2026-09-07', '2026-09-13', [1,2,3,4,5,6,7], '10:15', '06:45'],
    ['2026-09-14', '2026-09-20', [1,2,3,4,5,6,7], '10:15', '06:45'],
    ['2026-09-21', '2026-09-27', [1,2,3,4,5,6,7], '10:15', '06:45'],
    ['2026-09-28', '2026-09-30', [1,2,3], '10:15', '06:45'],
    ['2026-10-01', '2026-10-04', [4,5,6,7], '10:15', '06:35'],
    ['2026-10-05', '2026-10-11', [1,2,3,4,5,6,7], '10:15', '06:35'],
    ['2026-10-12', '2026-10-18', [1,2,3,4,5,6,7], '10:15', '06:35'],
    ['2026-10-19', '2026-10-24', [1,2,3,4,5,6], '10:15', '06:35'],
  ] },
  { from: 'TPE', to: 'SFO', fetchedAt: '2026-09-05T17:09:57.209Z', airlineId: 'JX', sourceFlightNumber: 'JX012', periods: latePacificPeriods },
];

/** Expand only the compact transcription, without deriving service days. */
export function capturedRows(service: CapturedService) {
  return service.periods.map(([start, end, days, departure, arrival]) => ({
    AirlineID: service.airlineId, FlightNumber: service.sourceFlightNumber,
    DepartureAirportID: service.from, ArrivalAirportID: service.to,
    ScheduleStartDate: start, ScheduleEndDate: end,
    DepartureTime: departure, ArrivalTime: arrival,
    Monday: days.includes(1), Tuesday: days.includes(2), Wednesday: days.includes(3),
    Thursday: days.includes(4), Friday: days.includes(5), Saturday: days.includes(6), Sunday: days.includes(7),
    CodeShare: [], UpdateTime: UPDATE_TIME,
  }));
}
