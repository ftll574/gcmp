import { Component, type ReactNode } from 'react';
import type { RoutingGroup } from '../lib/types.ts';
import { t } from '../i18n/i18n.ts';

interface Props {
  groups: ReadonlyArray<RoutingGroup>;
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
    const summaries = this.props.groups
      .map((g) => {
        if (g.legs.length === 0) return '';
        const first = g.legs[0]?.from;
        const last = g.legs[g.legs.length - 1]?.to;
        return `${first} → ${last}`;
      })
      .filter(Boolean)
      .join(' | ');
    return (
      <div className="map-fallback" role="alert">
        <p className="map-fallback-heading">{t('map.fallbackHeading')}</p>
        <p className="map-fallback-route">{summaries || '—'}</p>
        <p className="map-fallback-hint">{t('map.fallbackHint')}</p>
        <button type="button" className="map-fallback-retry" onClick={this.reset}>
          {t('map.retry')}
        </button>
      </div>
    );
  }
}
