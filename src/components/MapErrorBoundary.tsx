import { Component, type ReactNode } from 'react';
import type { Airport, Leg } from '../lib/types.ts';
import { t } from '../i18n/i18n.ts';

interface Props {
  airports: ReadonlyArray<Airport>;
  legs: ReadonlyArray<Leg>;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('MapView error caught by boundary:', error);
  }

  reset = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    const chain = this.props.airports.map((a) => a.iata).join(' → ');
    return (
      <div className="map-fallback" role="alert">
        <p className="map-fallback-heading">{t('map.fallbackHeading')}</p>
        <p className="map-fallback-route">{chain || '—'}</p>
        <p className="map-fallback-hint">{t('map.fallbackHint')}</p>
        <button type="button" className="map-fallback-retry" onClick={this.reset}>
          {t('map.retry')}
        </button>
      </div>
    );
  }
}
