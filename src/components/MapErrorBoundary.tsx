/**
 * Error boundary around the map. If anything throws during render, fall
 * back to a text-rendered route list + retry button. Earning panel keeps
 * working — the map failing doesn't take down the whole page.
 */

import { Component, type ReactNode } from 'react';
import type { Airport, Leg } from '../lib/types.ts';

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
    // Log for the developer; this is a non-fatal fallback path.
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
        <p className="map-fallback-heading">Map failed to render.</p>
        <p className="map-fallback-route">{chain || '(empty routing)'}</p>
        <p className="map-fallback-hint">
          The earning calculations still work. Retry the map render below.
        </p>
        <button type="button" className="map-fallback-retry" onClick={this.reset}>
          Retry
        </button>
      </div>
    );
  }
}
