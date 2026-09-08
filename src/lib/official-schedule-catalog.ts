import raw from '../data/official-schedules.json';
import { OfficialScheduleCatalogSchema } from './schemas/published-schedules.ts';

// Small curated fact catalog, not credentials or a bundled live API response.
export const officialScheduleCatalog = OfficialScheduleCatalogSchema.parse(raw);
