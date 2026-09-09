import { officialScheduleCatalog } from '../lib/official-schedule-catalog.ts';
import {
  RouteCatalogBrowser,
  type RouteCatalogBrowserProps,
} from './RouteCatalogBrowser.tsx';

type Props = Omit<RouteCatalogBrowserProps, 'officialSchedules'>;

/**
 * Lazy boundary for the optional all-routes disclosure.
 *
 * Keeping the bundled official schedule catalog behind this module prevents
 * its large static JSON payload from inflating the planner's initial chunk.
 */
export function RouteCatalogBrowserWithOfficialSchedules(props: Props): React.ReactElement {
  return <RouteCatalogBrowser {...props} officialSchedules={officialScheduleCatalog} />;
}
