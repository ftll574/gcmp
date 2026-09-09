import raw from '../../public/data/official-schedules.json';
import { OfficialScheduleCatalogSchema } from './schemas/published-schedules.ts';

/**
 * Static adapter for Node/server/report consumers.
 *
 * Browser code must receive this catalog from `useLoadedData` instead so the
 * 268 KB JSON remains runtime data and never inflates the client JS bundle.
 */
export const officialScheduleCatalog = OfficialScheduleCatalogSchema.parse(raw);
