import airports from '../public/data/airports.json' with { type: 'json' };
import { officialScheduleCatalog } from '../src/lib/official-schedule-catalog.ts';
import { mergeOfficialSchedules, queryOfficialSchedules } from '../src/lib/rtw/official-schedules.ts';
import { FlightQuerySchema, FlightQueryResponseSchema, type FlightQuery, type FlightQueryResponse } from '../src/lib/schemas/dated-schedules.ts';
import { createScheduleGateway } from './flight-schedules.ts';
import { createTdxGateway } from './tdx-schedules.ts';

export type ScheduleProvider = 'auto' | 'tdx' | 'official' | 'cirium';
export type ResolvedScheduleProvider = Exclude<ScheduleProvider, 'auto'>;
export const DEFAULT_SCHEDULE_PROVIDER: ScheduleProvider = 'tdx';
const TAIWAN_AIRPORTS = new Set(airports.filter((airport) => airport.country === 'TW').map((airport) => airport.iata));

interface Options {
  provider?: ScheduleProvider;
  clientId?: string | undefined; clientSecret?: string | undefined;
  appId?: string | undefined; appKey?: string | undefined;
  dailyBudget?: number; fetchImpl?: typeof fetch; now?: () => number;
}

export function selectScheduleProvider(
  requested: ScheduleProvider,
  query: Pick<FlightQuery, 'from' | 'to'>,
  availability: { tdx: boolean; cirium: boolean },
): ResolvedScheduleProvider {
  if (requested !== 'auto') return requested;
  const touchesTaiwan = TAIWAN_AIRPORTS.has(query.from) || TAIWAN_AIRPORTS.has(query.to);
  if (touchesTaiwan && availability.tdx) return 'tdx';
  if (availability.cirium) return 'cirium';
  return 'official';
}

/** TDX remains the backwards-compatible default. `auto` is an explicit,
 * route-aware mode: Taiwan routes use configured TDX first; other routes use
 * configured Cirium. Selection happens before the request and never fails
 * over to another paid provider after an error, so one user action cannot
 * silently spend two supplier quotas. Official publications are always merged
 * as a credential-free fallback/corroboration layer. */
export function createHybridScheduleGateway(options: Options = {}) {
  const requestedProvider = options.provider ?? DEFAULT_SCHEDULE_PROVIDER;
  const now = options.now ?? Date.now;
  const tdxGateway = createTdxGateway(options);
  const ciriumGateway = createScheduleGateway(options);
  const externallyConfigured = requestedProvider === 'auto'
    ? tdxGateway.configured || ciriumGateway.configured
    : requestedProvider === 'cirium' ? ciriumGateway.configured
      : requestedProvider === 'tdx' ? tdxGateway.configured
        : false;
  return {
    configured: externallyConfigured,
    capabilities: {
      selectedProvider: requestedProvider === 'auto' ? 'route-aware-auto' : requestedProvider,
      officialServices: officialScheduleCatalog.services.length,
      officialDates: true,
      credentialsConfigured: externallyConfigured,
      tdxConfigured: tdxGateway.configured,
      ciriumConfigured: ciriumGateway.configured,
      automaticProviderSelection: requestedProvider === 'auto',
      globalDatedProviderConfigured: ciriumGateway.configured,
    },
    async query(input: unknown): Promise<FlightQueryResponse> {
      const query = FlightQuerySchema.parse(input);
      const fallback = queryOfficialSchedules(officialScheduleCatalog, query, now());
      const provider = selectScheduleProvider(requestedProvider, query, {
        tdx: tdxGateway.configured,
        cirium: ciriumGateway.configured,
      });
      if (provider === 'official') return fallback;
      const gateway = provider === 'cirium' ? ciriumGateway : tdxGateway;
      return FlightQueryResponseSchema.parse(mergeOfficialSchedules(await gateway.query(query), fallback, now()));
    },
  };
}
