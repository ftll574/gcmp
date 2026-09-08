import { officialScheduleCatalog } from '../src/lib/official-schedule-catalog.ts';
import { mergeOfficialSchedules, queryOfficialSchedules } from '../src/lib/rtw/official-schedules.ts';
import { FlightQuerySchema, FlightQueryResponseSchema, type FlightQueryResponse } from '../src/lib/schemas/dated-schedules.ts';
import { createScheduleGateway } from './flight-schedules.ts';
import { createTdxGateway } from './tdx-schedules.ts';

interface Options {
  provider?: 'tdx' | 'official' | 'cirium';
  clientId?: string | undefined; clientSecret?: string | undefined;
  appId?: string | undefined; appKey?: string | undefined;
  dailyBudget?: number; fetchImpl?: typeof fetch; now?: () => number;
}
/** TDX by default, paid providers ONLY by explicit server-side selection.
 * A failure never silently spends a second supplier's quota. Official
 * publications remain available locally without credentials or a gateway. */
export function createHybridScheduleGateway(options: Options = {}) {
  const provider = options.provider ?? 'tdx';
  const now = options.now ?? Date.now;
  const gateway = provider === 'cirium' ? createScheduleGateway(options) : createTdxGateway(options);
  return {
    configured: provider !== 'official' && gateway.configured,
    capabilities: { selectedProvider: provider, officialServices: officialScheduleCatalog.services.length, officialDates: true, credentialsConfigured: provider !== 'official' && gateway.configured },
    async query(input: unknown): Promise<FlightQueryResponse> {
      const query = FlightQuerySchema.parse(input);
      const fallback = queryOfficialSchedules(officialScheduleCatalog, query, now());
      if (provider === 'official') return fallback;
      return FlightQueryResponseSchema.parse(mergeOfficialSchedules(await gateway.query(query), fallback, now()));
    },
  };
}
