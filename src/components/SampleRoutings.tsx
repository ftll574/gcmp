/**
 * Sample-routings carousel — surfaces on first visit and in Beginner mode
 * when the chain is empty. Click a card → fills the routing immediately.
 *
 * Cards include single-group ("simple") and multi-group ("comparison")
 * routings to teach the new gcmap-style comparison feature.
 */

import { useLocale } from '../i18n/use-locale.ts';
import type { RoutingRequest } from '../lib/types.ts';

interface Sample {
  id: 'sfoNrtBkk' | 'jfkLhrCdg' | 'laxNrtKix' | 'tpeBkkHkg' | 'compareAaAs';
  request: RoutingRequest;
}

const SAMPLES: ReadonlyArray<Sample> = [
  {
    id: 'sfoNrtBkk',
    request: {
      groups: [
        {
          legs: [
            { from: 'SFO', to: 'NRT', operatingCarrier: 'AA' },
            { from: 'NRT', to: 'BKK', operatingCarrier: 'JL' },
          ],
        },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    },
  },
  {
    id: 'jfkLhrCdg',
    request: {
      groups: [
        {
          legs: [
            { from: 'JFK', to: 'LHR', operatingCarrier: 'BA' },
            { from: 'LHR', to: 'CDG', operatingCarrier: 'BA' },
          ],
        },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    },
  },
  {
    id: 'laxNrtKix',
    request: {
      groups: [
        {
          legs: [
            { from: 'LAX', to: 'NRT', operatingCarrier: 'JL' },
            { from: 'NRT', to: 'KIX', operatingCarrier: 'JL' },
          ],
        },
      ],
      cabin: 'economy',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    },
  },
  {
    id: 'tpeBkkHkg',
    request: {
      groups: [
        {
          legs: [
            { from: 'TPE', to: 'BKK', operatingCarrier: 'CX' },
            { from: 'BKK', to: 'HKG', operatingCarrier: 'CX' },
          ],
        },
      ],
      cabin: 'business',
      programs: ['aa-aadvantage', 'as-mileage-plan'],
    },
  },
  {
    id: 'compareAaAs',
    request: {
      groups: [
        { legs: [{ from: 'SFO', to: 'HKG', operatingCarrier: 'CX' }] },
        {
          legs: [
            { from: 'SFO', to: 'NRT', operatingCarrier: 'JL' },
            { from: 'NRT', to: 'HKG', operatingCarrier: 'CX' },
          ],
        },
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
      <header className="sample-routings-hero">
        <h2 className="sample-routings-tagline">{t('hero.tagline')}</h2>
        <p className="sample-routings-subtagline">{t('hero.subtagline')}</p>
      </header>
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
