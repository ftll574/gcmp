/**
 * Sample-routings carousel — surfaces on first visit and in Beginner mode
 * when the chain is empty. Click a card → fills the routing immediately.
 *
 * Each sample is a pre-built RoutingRequest. The map + earning panel light
 * up so the user can SEE what the tool does without learning IATA codes.
 */

import { useLocale } from '../i18n/use-locale.ts';
import type { RoutingRequest } from '../lib/types.ts';

interface Sample {
  /** Translation key root — `samples.<id>.title` and `samples.<id>.subtitle`. */
  id: 'sfoNrtBkk' | 'jfkLhrCdg' | 'laxNrtKix' | 'tpeBkkHkg';
  request: RoutingRequest;
}

const SAMPLES: ReadonlyArray<Sample> = [
  {
    id: 'sfoNrtBkk',
    request: {
      legs: [
        { from: 'SFO', to: 'NRT', operatingCarrier: 'AA' },
        { from: 'NRT', to: 'BKK', operatingCarrier: 'JL' },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    },
  },
  {
    id: 'jfkLhrCdg',
    request: {
      legs: [
        { from: 'JFK', to: 'LHR', operatingCarrier: 'BA' },
        { from: 'LHR', to: 'CDG', operatingCarrier: 'BA' },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    },
  },
  {
    id: 'laxNrtKix',
    request: {
      legs: [
        { from: 'LAX', to: 'NRT', operatingCarrier: 'JL' },
        { from: 'NRT', to: 'KIX', operatingCarrier: 'JL' },
      ],
      cabin: 'economy',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    },
  },
  {
    id: 'tpeBkkHkg',
    request: {
      legs: [
        { from: 'TPE', to: 'BKK', operatingCarrier: 'CX' },
        { from: 'BKK', to: 'HKG', operatingCarrier: 'CX' },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    },
  },
];

interface Props {
  onSelect: (request: RoutingRequest) => void;
}

export function SampleRoutings({ onSelect }: Props): React.ReactElement {
  const { t } = useLocale();
  return (
    <section className="sample-routings" aria-label={t('input.exampleButton')}>
      <p className="sample-routings-hint">{t('input.exampleHint')}</p>
      <div className="sample-routings-grid">
        {SAMPLES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="sample-routing-card"
            onClick={() => onSelect(s.request)}
          >
            <span className="sample-routing-title">{t(`samples.${s.id}.title`)}</span>
            <span className="sample-routing-subtitle">{t(`samples.${s.id}.subtitle`)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
